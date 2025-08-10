// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOBNMintable is IERC20 {
    function mint(address to, uint256 amount) external;
}

interface IEmissionsController {
    function currentBpsFor(address pool) external view returns (uint256);
}

// Minimal EIP-2612 interface (your OBN token supports this)
interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external;
}

/**
 * @title OBNStakingPools
 * @notice Multi-pool staking with deflationary emissions, global BPS control via EmissionsController,
 *         15% charity + 1–5% treasury split, and efficient charity distribution.
 *
 *         Permanent lock model:
 *           - A per-user per-pool *amount* can be permanently locked.
 *           - Only the locked slice is non-withdrawable; all future deposits remain free unless explicitly locked.
 *
 *  Upgrade notes:
 *   - Kept previous LockInfo mapping in storage for layout safety, but it no longer gates withdrawals.
 *   - Added `lockedAmount[pid][user]` earlier; storage gap adjusted once (still intact here).
 */
contract OBNStakingPools is Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IOBNMintable;
    using SafeERC20 for IERC20;

    struct PoolInfo {
        address charityWallet;
        bool active;
        uint256 totalStaked;
    }

    struct UserPoolInfo {
        uint256 amount;
    }

    struct Phase {
        uint256 start;
        uint256 end;
        uint256 bps;
    }

    // Legacy per-user per-pool lock (kept for storage-compatibility; no longer enforced)
    struct LockInfo {
        uint256 unlockTime;   // deprecated
        bool permaLocked;     // deprecated
    }

    IOBNMintable public stakingToken;
    address public treasury;
    uint256 public treasuryBps; // bounded 1–5%
    uint256 public constant CHARITY_BPS = 1500; // 15%
    uint256 public constant MAX_POOLS = 25;

    string public currentVersion;
    bool public paused;

    // Optional global controller; if 0-address, fallback to local phases
    IEmissionsController public emissionsController;
    event EmissionsControllerSet(address indexed controller);

    Phase[] public phases; // fallback deflation schedule
    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserPoolInfo)) public userPool;

    uint256 public globalTotalStaked;
    uint256 public globalAccRewardPerShare; // scaled by 1e12
    uint256 public lastGlobalRewardTime;

    mapping(address => uint256) public userTotalStaked;
    mapping(address => uint256) public userRewardDebt;

    mapping(address => uint256) public totalClaimedByUser;
    mapping(address => uint256) public totalDepositedByUser;
    mapping(address => uint256) public totalWithdrawnByUser;

    mapping(uint256 => uint256) public totalClaimedByPool;
    mapping(uint256 => uint256) public totalDepositedByPool;
    mapping(uint256 => uint256) public totalWithdrawnByPool;

    // Charity buffer + round-robin cursor
    uint256 public charityBuffer;
    uint256 public charityCursor;

    // Legacy locks mapping (not enforced anymore; preserved for storage)
    mapping(uint256 => mapping(address => LockInfo)) public lockInfo; // pid => user => lock

    // Permanent locked slice per user per pool
    mapping(uint256 => mapping(address => uint256)) public lockedAmount;

    // Events
    event PoolAdded(uint256 indexed pid, address charityWallet);
    event PoolRetired(uint256 indexed pid);
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Claim(address indexed user, uint256 amount, bool toStake);
    event TreasuryBpsChanged(uint256 newBps);
    event Paused(bool isPaused);
    event PhaseAdded(uint256 start, uint256 end, uint256 bps);
    event ContractVersion(string version);
    event RewardStaked(address indexed user, uint256 indexed pid, uint256 amount);
    event CharityDistributed(uint256 indexed pid, uint256 amount);
    event CharityBuffered(uint256 amount);
    event CharityMintFailed(uint256 indexed pid, uint256 amount);

    // Legacy lock events (kept to avoid removing ABI items)
    event LockSet(uint256 indexed pid, address indexed user, uint256 unlockTime); // deprecated
    event PermanentLockSet(uint256 indexed pid, address indexed user, bool locked); // deprecated

    // New lock event
    event LockedAmountSet(uint256 indexed pid, address indexed user, uint256 amount);

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IOBNMintable _stakingToken,
        address _treasury
    ) public initializer {
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);

        require(address(_stakingToken) != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");

        stakingToken = _stakingToken;
        treasury = _treasury;
        treasuryBps = 500; // default 5%

        // Local fallback phases (used only if controller is unset)
        uint256 start = block.timestamp;
        uint256 year = 365 days;
        phases.push(Phase(start, start + 2 * year, 1000)); // 10%
        phases.push(Phase(start + 2 * year, start + 4 * year, 750)); // 7.5%
        phases.push(Phase(start + 4 * year, start + 6 * year, 500)); // 5%
        phases.push(Phase(start + 6 * year, start + 8 * year, 250)); // 2.5%
        phases.push(Phase(start + 8 * year, start + 10 * year, 125)); // 1.25%

        lastGlobalRewardTime = block.timestamp;
        currentVersion = "4.2.0";
        emit ContractVersion(currentVersion);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {
        currentVersion = "4.2.X";
        emit ContractVersion(currentVersion);
    }

    // ----------------- Admin -----------------

    function setEmissionsController(address controller) external onlyOwner {
        emissionsController = IEmissionsController(controller);
        emit EmissionsControllerSet(controller);
    }

    function addPool(address charityWallet) external onlyOwner {
        require(charityWallet != address(0), "Invalid charity");
        require(poolInfo.length < MAX_POOLS, "Pool cap reached");
        poolInfo.push(PoolInfo(charityWallet, true, 0));
        emit PoolAdded(poolInfo.length - 1, charityWallet);
    }

    function retirePool(uint256 pid) external onlyOwner nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        // Effects-only accrual (no external calls)
        (, uint256 tCut) = _accrueGlobal();
        poolInfo[pid].active = false;
        emit PoolRetired(pid);
        // Interactions last
        _mintCuts(tCut);
    }

    function setTreasuryBps(uint256 newBps) external onlyOwner {
        require(newBps >= 100 && newBps <= 500, "1-5%");
        treasuryBps = newBps;
        emit TreasuryBpsChanged(newBps);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /// @notice Add local phase (only used if controller unset). Enforces non-overlap.
    function addPhase(uint256 start, uint256 end, uint256 bps) external onlyOwner {
        require(start < end, "Invalid");
        uint256 len = phases.length;
        if (len > 0) {
            require(start >= phases[len - 1].end, "Must be contiguous/non-overlap");
        }
        phases.push(Phase(start, end, bps));
        emit PhaseAdded(start, end, bps);
    }

    function sweep(address token, uint256 amount) external onlyOwner {
        require(token != address(stakingToken), "Cannot sweep staking token");
        IERC20(token).safeTransfer(treasury, amount);
    }

    // ----------------- Permanent lock admin -----------------

    /**
     * @notice Set a user's permanently locked slice for a pool.
     *         Only the amount up to the user's current stake can be locked.
     *         Use this for the initial bootstrap lock on your charity wallet.
     */
    function setLockedAmount(uint256 pid, address user, uint256 amount) external onlyOwner {
        require(pid < poolInfo.length, "Invalid pool");
        uint256 bal = userPool[pid][user].amount;
        require(amount <= bal, "amount > balance");
        lockedAmount[pid][user] = amount;
        emit LockedAmountSet(pid, user, amount);
    }

    /**
     * @notice Backward-compatible API: when `locked_ = true`, lock ENTIRE current balance;
     *         when `false`, unlock fully (sets locked slice to 0). Kept for ABI stability.
     */
    function setPermanentLock(uint256 pid, address user, bool locked_) external onlyOwner {
        require(pid < poolInfo.length, "Invalid pool");
        if (locked_) {
            uint256 bal = userPool[pid][user].amount;
            lockedAmount[pid][user] = bal;
            emit LockedAmountSet(pid, user, bal);
        } else {
            lockedAmount[pid][user] = 0;
            emit LockedAmountSet(pid, user, 0);
        }
        emit PermanentLockSet(pid, user, locked_);
    }

    // ----------------- Emissions -----------------

    /// @notice Compute this pool manager’s rewards/sec based on controller BPS or local fallback phases.
    function currentRewardsPerSecond() public view returns (uint256) {
        // Controller path (preferred)
        if (address(emissionsController) != address(0)) {
            uint256 poolBps = emissionsController.currentBpsFor(address(this));
            if (poolBps == 0 || globalTotalStaked == 0) return 0;
            uint256 yearly = (globalTotalStaked * poolBps) / 10000;
            return yearly / (365 days);
        }

        // Fallback to local phases (legacy mode)
        uint256 nowTs = block.timestamp;
        uint256 len = phases.length; // cache
        for (uint256 i = 0; i < len; i++) {
            if (nowTs >= phases[i].start && nowTs < phases[i].end) {
                uint256 yearly = (globalTotalStaked * phases[i].bps) / 10000;
                return yearly / (365 days);
            }
        }
        return 0;
    }

    /**
     * @dev Effects-only accrual. Updates accumulators/buffers/time and RETURNS the cuts to mint.
     *      NO external calls here (avoids “state written after external call” in callers).
     */
    function _accrueGlobal() internal returns (uint256 sCut, uint256 tCut) {
        if (block.timestamp <= lastGlobalRewardTime) return (0, 0);
        if (globalTotalStaked == 0) {
            lastGlobalRewardTime = block.timestamp;
            return (0, 0);
        }

        uint256 elapsed = block.timestamp - lastGlobalRewardTime;
        uint256 reward = elapsed * currentRewardsPerSecond();
        if (reward < 1) {
            lastGlobalRewardTime = block.timestamp;
            return (0, 0);
        }

        uint256 charityCut = (reward * CHARITY_BPS) / 10000;
        tCut = (reward * treasuryBps) / 10000;
        sCut = reward - charityCut - tCut;

        if (sCut > 0) {
            // accrue staker share to accumulator (effects)
            globalAccRewardPerShare += (sCut * 1e12) / globalTotalStaked;
        }
        if (charityCut > 0) {
            charityBuffer += charityCut;
            emit CharityBuffered(charityCut);
        }
        // update time marker last (effects)
        lastGlobalRewardTime = block.timestamp;
    }

    /**
     * @dev Interactions-only mint for tCut (treasury). Staker share is NOT pre-minted
     *      — users are minted on demand when they claim.
     */
    function _mintCuts(uint256 tCut) internal {
        if (tCut > 0) {
            stakingToken.mint(treasury, tCut);
        }
    }

    // ----------------- Charity auto-flush helpers -----------------

    /// @dev Auto-distribute charity for a single PID (proportional to totalStaked).
    function _autoDistributeCharityForPid(uint256 pid) internal {
        if (pid >= poolInfo.length) return;
        PoolInfo memory p = poolInfo[pid];
        if (!p.active || p.totalStaked < 1 || globalTotalStaked < 1) return;

        uint256 buffer = charityBuffer;
        if (buffer < 1) return;

        uint256 portion = (buffer * p.totalStaked) / globalTotalStaked;
        if (portion < 1) return;

        // ---- EFFECTS first (CEI) ----
        unchecked { charityBuffer = buffer - portion; }
        totalClaimedByPool[pid] += portion;

        // ---- INTERACTIONS last ----
        // slither-disable-next-line calls-loop
        try stakingToken.mint(p.charityWallet, portion) {
            emit CharityDistributed(pid, portion);
        } catch {
            // restore effects on failure
            // slither-disable-next-line reentrancy-no-eth
            charityBuffer += portion;
            // slither-disable-next-line reentrancy-no-eth
            totalClaimedByPool[pid] -= portion;
            emit CharityMintFailed(pid, portion);
        }
    }

    /// @dev Auto-distribute charity for up to MAX_POOLS where `user` has a stake.
    function _autoDistributeCharityForUser(address user) internal {
        uint256 len = poolInfo.length;
        if (len < 1 || charityBuffer < 1 || globalTotalStaked < 1) return;

        uint256 processed = 0;
        for (uint256 pid = 0; pid < len; pid++) {
            if (userPool[pid][user].amount > 0) {
                _autoDistributeCharityForPid(pid);
                processed++;
                if (charityBuffer < 1 || processed >= MAX_POOLS) break; // bounded
            }
        }
    }

    // ----------------- User Actions -----------------

    function deposit(uint256 pid, uint256 amount) external nonReentrant whenNotPaused {
        _depositForCore(pid, amount, msg.sender, false, 0);
    }

    function withdraw(uint256 pid, uint256 amount) public nonReentrant whenNotPaused {
        require(pid < poolInfo.length, "Invalid pool");
        uint256 userBal = userPool[pid][msg.sender].amount;
        require(amount > 0 && userBal >= amount, "Exceeds staked amount");

        // Permanent lock: only locked slice is non-withdrawable
        uint256 locked = lockedAmount[pid][msg.sender];
        if (locked > userBal) locked = userBal; // cap to balance
        uint256 available = userBal - locked;
        require(amount <= available, "amount exceeds unlocked");

        // Effects-only accrual
        (, uint256 tCut) = _accrueGlobal();

        uint256 acc = globalAccRewardPerShare;
        uint256 pending = ((userTotalStaked[msg.sender] * acc) / 1e12) - userRewardDebt[msg.sender];

        // ---- EFFECTS ----
        userPool[pid][msg.sender].amount = userBal - amount;
        poolInfo[pid].totalStaked        -= amount;
        userTotalStaked[msg.sender]      -= amount;
        globalTotalStaked                -= amount;
        totalWithdrawnByUser[msg.sender] += amount;
        totalWithdrawnByPool[pid]        += amount;

        userRewardDebt[msg.sender] = (userTotalStaked[msg.sender] * acc) / 1e12;
        if (pending > 0) {
            totalClaimedByUser[msg.sender] += pending;
        }

        // Keep locked slice coherent after balance changes
        uint256 newBal = userPool[pid][msg.sender].amount;
        if (lockedAmount[pid][msg.sender] > newBal) {
            lockedAmount[pid][msg.sender] = newBal; // cap
            emit LockedAmountSet(pid, msg.sender, newBal);
        }

        // ---- INTERACTIONS ----
        _autoDistributeCharityForPid(pid);
        if (pending > 0) {
            stakingToken.mint(msg.sender, pending);
            emit Claim(msg.sender, pending, false);
        }
        stakingToken.safeTransfer(msg.sender, amount);
        _mintCuts(tCut);

        emit Withdraw(msg.sender, pid, amount);
    }

    function claimToWallet() external nonReentrant whenNotPaused {
        // Effects-only accrual
        (, uint256 tCut) = _accrueGlobal();

        uint256 acc = globalAccRewardPerShare;
        uint256 pending = ((userTotalStaked[msg.sender] * acc) / 1e12) - userRewardDebt[msg.sender];

        // ---- EFFECTS ----
        userRewardDebt[msg.sender] = (userTotalStaked[msg.sender] * acc) / 1e12;
        if (pending > 0) {
            totalClaimedByUser[msg.sender] += pending;
        }

        // ---- INTERACTIONS ----
        _autoDistributeCharityForUser(msg.sender);
        if (pending > 0) {
            stakingToken.mint(msg.sender, pending);
            emit Claim(msg.sender, pending, false);
        }
        _mintCuts(tCut);
    }

    /// @notice Allow anyone to trigger a user's reward claim (pays to the user) and auto-flush charity for their pools.
    function claimFor(address user) external nonReentrant whenNotPaused {
        // Effects-only accrual
        (, uint256 tCut) = _accrueGlobal();

        uint256 acc = globalAccRewardPerShare;
        uint256 pending = ((userTotalStaked[user] * acc) / 1e12) - userRewardDebt[user];

        // ---- EFFECTS ----
        userRewardDebt[user] = (userTotalStaked[user] * acc) / 1e12;
        if (pending > 0) {
            totalClaimedByUser[user] += pending;
        }

        // ---- INTERACTIONS ----
        _autoDistributeCharityForUser(user);
        if (pending > 0) {
            stakingToken.mint(user, pending);
            emit Claim(user, pending, false);
        }
        _mintCuts(tCut);
    }

    // ----------------- Deposit on behalf (with optional permanent lock) -----------------

    /// @notice Deposit on behalf (no lock).
    function depositFor(uint256 pid, uint256 amount, address beneficiary)
        public
        nonReentrant
        whenNotPaused
    {
        _depositForCore(pid, amount, beneficiary, false, 0);
    }

    /**
     * @notice Deposit on behalf and permanently lock THIS deposit amount.
     *         `unlockTime` param is ignored (kept for ABI compatibility).
     */
    function depositForWithLock(uint256 pid, uint256 amount, address beneficiary, uint256 /* unlockTime */)
        external
        nonReentrant
        whenNotPaused
    {
        _depositForCore(pid, amount, beneficiary, true, 0);
    }

    /**
     * @notice Single-tx deposit using EIP-2612 `permit`. Optionally lock THIS deposit amount.
     * @dev Frontend must sign a permit for `value = amount`, `spender = address(this)`.
     */
    function depositWithPermit(
        uint256 pid,
        uint256 amount,
        address beneficiary,
        bool lockThisDeposit,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external nonReentrant whenNotPaused {
        // Set allowance in the token via EIP-2612
        IERC20Permit(address(stakingToken)).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v, r, s
        );
        // Now perform the normal deposit path (this will transferFrom)
        _depositForCore(pid, amount, beneficiary, lockThisDeposit, 0);
    }

    /// @dev Core deposit path used by deposit/depositFor/depositForWithLock/depositWithPermit.
    function _depositForCore(
        uint256 pid,
        uint256 amount,
        address beneficiary,
        bool setLock,
        uint256 /* unlockTime (ignored) */
    ) internal {
        require(amount > 0, "Cannot stake 0 tokens");
        require(pid < poolInfo.length, "Invalid pool");
        require(poolInfo[pid].active, "Pool retired");
        require(beneficiary != address(0), "beneficiary=0");

        // Effects-only accrual
        (, uint256 tCut) = _accrueGlobal();

        uint256 acc = globalAccRewardPerShare;
        uint256 pending = ((userTotalStaked[beneficiary] * acc) / 1e12) - userRewardDebt[beneficiary];

        // ---- EFFECTS ----
        userPool[pid][beneficiary].amount += amount;
        poolInfo[pid].totalStaked         += amount;
        userTotalStaked[beneficiary]      += amount;
        globalTotalStaked                 += amount;
        totalDepositedByUser[beneficiary] += amount;
        totalDepositedByPool[pid]         += amount;

        userRewardDebt[beneficiary] = (userTotalStaked[beneficiary] * acc) / 1e12;

        if (pending > 0) {
            totalClaimedByUser[beneficiary] += pending;
        }

        // ---- PERMANENT LOCK: lock only this deposit amount if requested ----
        if (setLock) {
            lockedAmount[pid][beneficiary] += amount;
            emit LockedAmountSet(pid, beneficiary, lockedAmount[pid][beneficiary]);
        }

        // ---- INTERACTIONS ----
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        _autoDistributeCharityForPid(pid);
        if (pending > 0) {
            stakingToken.mint(beneficiary, pending);
            emit Claim(beneficiary, pending, false);
        }
        _mintCuts(tCut);

        emit Deposit(beneficiary, pid, amount);
    }

    // ----------------- Charity pagination (optional admin paths) -----------------

    /// @notice Distribute up to `maxPools` worth of charity from the buffer using round-robin.
    function distributeCharity(uint256 maxPools) public nonReentrant {
        // Effects-only accrual to keep buffer fresh
        (, uint256 tCut) = _accrueGlobal();

        uint256 len = poolInfo.length;
        if (len < 1 || charityBuffer < 1 || globalTotalStaked < 1 || maxPools < 1) {
            _mintCuts(tCut);
            return;
        }

        uint256 processed = 0;
        uint256 startIdx = charityCursor % len;
        uint256 distributedTotal = 0;

        for (uint256 step = 0; step < maxPools; step++) {
            uint256 pid = (startIdx + step) % len;
            PoolInfo memory p = poolInfo[pid];
            if (p.active && p.totalStaked > 0) {
                uint256 portion = (charityBuffer * p.totalStaked) / globalTotalStaked;
                if (portion > 0) {
                    // ---- EFFECTS first ----
                    totalClaimedByPool[pid] += portion;
                    distributedTotal += portion;

                    // ---- INTERACTIONS last ----
                    // slither-disable-next-line calls-loop
                    try stakingToken.mint(p.charityWallet, portion) {
                        emit CharityDistributed(pid, portion);
                    } catch {
                        // rollback effects for this pid
                        // slither-disable-next-line reentrancy-no-eth
                        totalClaimedByPool[pid] -= portion;
                        // slither-disable-next-line reentrancy-no-eth
                        distributedTotal -= portion;
                        emit CharityMintFailed(pid, portion);
                    }
                }
            }
            processed++;
            if (processed == maxPools) break;
        }

        // slither-disable-next-line reentrancy-no-eth
        charityCursor = (startIdx + processed) % len;
        if (distributedTotal > 0) {
            // slither-disable-next-line reentrancy-no-eth
            unchecked { charityBuffer -= distributedTotal; }
        }

        _mintCuts(tCut);
    }

    /// @notice Distribute charity only to the provided `pids` (bounded).
    function distributeCharityFor(uint256[] calldata pids) external nonReentrant {
        // Effects-only accrual
        (, uint256 tCut) = _accrueGlobal();

        if (charityBuffer < 1 || globalTotalStaked < 1) {
            _mintCuts(tCut);
            return;
        }

        require(pids.length <= MAX_POOLS, "too many pids");

        uint256 distributedTotal = 0;
        uint256 len = pids.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 pid = pids[i];
            require(pid < poolInfo.length, "Invalid pid");
            PoolInfo memory p = poolInfo[pid];
            if (p.active && p.totalStaked > 0) {
                uint256 portion = (charityBuffer * p.totalStaked) / globalTotalStaked;
                if (portion > 0) {
                    // ---- EFFECTS first ----
                    totalClaimedByPool[pid] += portion;
                    distributedTotal += portion;

                    // ---- INTERACTIONS last ----
                    // slither-disable-next-line calls-loop
                    try stakingToken.mint(p.charityWallet, portion) {
                        emit CharityDistributed(pid, portion);
                    } catch {
                        // rollback effects for this pid
                        // slither-disable-next-line reentrancy-no-eth
                        totalClaimedByPool[pid] -= portion;
                        // slither-disable-next-line reentrancy-no-eth
                        distributedTotal -= portion;
                        emit CharityMintFailed(pid, portion);
                    }
                }
            }
        }
        if (distributedTotal > 0) {
            // slither-disable-next-line reentrancy-no-eth
            unchecked { charityBuffer -= distributedTotal; }
        }

        _mintCuts(tCut);
    }

    /// @notice Estimated charity for a pool if distribution ran right now.
    function pendingCharityFor(uint256 pid) external view returns (uint256) {
        if (pid >= poolInfo.length) return 0;
        PoolInfo memory p = poolInfo[pid];
        if (!p.active || p.totalStaked == 0 || globalTotalStaked == 0) return 0;

        uint256 accBuffer = charityBuffer;
        if (block.timestamp > lastGlobalRewardTime && globalTotalStaked != 0) {
            uint256 elapsed = block.timestamp - lastGlobalRewardTime;
            uint256 reward = elapsed * currentRewardsPerSecond();
            uint256 charityCut = (reward * CHARITY_BPS) / 10000;
            accBuffer += charityCut;
        }
        return (accBuffer * p.totalStaked) / globalTotalStaked;
    }

    // ----------------- Views -----------------

    function getPoolInfo(uint256 pid) external view returns (address charityWallet, bool active, uint256 totalStaked) {
        PoolInfo memory p = poolInfo[pid];
        return (p.charityWallet, p.active, p.totalStaked);
    }

    function getTotalStakedAcrossPools() external view returns (uint256) {
        return globalTotalStaked;
    }

    function pendingRewards(address userAddr) public view returns (uint256) {
        uint256 acc = globalAccRewardPerShare;
        if (block.timestamp > lastGlobalRewardTime && globalTotalStaked != 0) {
            uint256 elapsed = block.timestamp - lastGlobalRewardTime;
            uint256 reward = elapsed * currentRewardsPerSecond();
            uint256 sCut = reward - ((reward * CHARITY_BPS) / 10000) - ((reward * treasuryBps) / 10000);
            acc += (sCut * 1e12) / globalTotalStaked;
        }
        return ((userTotalStaked[userAddr] * acc) / 1e12) - userRewardDebt[userAddr];
    }

    function getUserStakeValue(uint256 pid, address userAddr) external view returns (uint256) {
        return userPool[pid][userAddr].amount;
    }

    function unlockedBalance(uint256 pid, address user) external view returns (uint256) {
        uint256 bal = userPool[pid][user].amount;
        uint256 locked = lockedAmount[pid][user];
        if (locked > bal) locked = bal;
        return bal - locked;
    }

    function getUserStats(address userAddr) external view returns (
        uint256 totalUserStaked,
        uint256 totalUserClaimed,
        uint256 totalUserDeposited,
        uint256 totalUserWithdrawn,
        uint256 poolCount
    ) {
        uint256 len = poolInfo.length; // cache
        for (uint256 i = 0; i < len; i++) {
            uint256 amt = userPool[i][userAddr].amount;
            if (amt > 0) {
                poolCount++;
                totalUserStaked += amt;
            }
        }
        return (
            totalUserStaked,
            totalClaimedByUser[userAddr],
            totalDepositedByUser[userAddr],
            totalWithdrawnByUser[userAddr],
            poolCount
        );
    }

    function getPoolAPR() external view returns (uint256 aprBps) {
        if (globalTotalStaked == 0) return 0;
        uint256 yearly = currentRewardsPerSecond() * 365 days;
        return (yearly * 10000) / globalTotalStaked;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function getEmissionStatus() external view returns (
        uint256 currentBps,
        uint256 emissionPerSecond,
        uint256 phaseStart,
        uint256 phaseEnd
    ) {
        // Prefer controller status if set
        if (address(emissionsController) != address(0)) {
            currentBps = emissionsController.currentBpsFor(address(this));
            emissionPerSecond = (globalTotalStaked == 0)
                ? 0
                : ((globalTotalStaked * currentBps) / 10000) / (365 days);
            return (currentBps, emissionPerSecond, 0, 0);
        }

        // Fallback local phases view
        uint256 nowTs = block.timestamp;
        uint256 len = phases.length; // cache
        for (uint256 i = 0; i < len; i++) {
            if (nowTs >= phases[i].start && nowTs < phases[i].end) {
                currentBps = phases[i].bps;
                emissionPerSecond = (globalTotalStaked == 0)
                    ? 0
                    : ((globalTotalStaked * currentBps) / 10000) / (365 days);
                phaseStart = phases[i].start;
                phaseEnd = phases[i].end;
                return (currentBps, emissionPerSecond, phaseStart, phaseEnd);
            }
        }
        return (0, 0, 0, 0);
    }

    // ---- Storage gap for future upgrades ----
    uint256[45] private __gap;
}
