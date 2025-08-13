// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "./interfaces/IOBNMintable.sol";

/**
 * @title OBNStakingPools
 * @notice Timestamp-based emissions with fixed 4-way split:
 *         88% stakers, 10% charity buffer, 1% charity fund, 1% treasury.
 *         Per-pool accumulators; equal APR/token across pools.
 *         CEI + nonReentrant on mutating functions.
 *
 * @dev NOTE: All "retire pool" / "active" logic has been removed.
 */
contract OBNStakingPools is Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IOBNMintable;
    using SafeERC20 for IERC20;

    // ---------- Fixed split (BPS) ----------
    uint256 public constant STAKER_BPS       = 8800; // 88%
    uint256 public constant CHARITY_BPS      = 1000; // 10% (buffered then allocated/minted per-pool)
    uint256 public constant CHARITY_FUND_BPS = 100;  // 1%
    uint256 public constant TREASURY_BPS     = 100;  // 1%
    uint256 public constant TOTAL_BPS        = 10000;

    // ---------- Types ----------
    struct PoolInfo {
        // tightened layout: removed `bool active`
        address charityWallet;
        uint256 totalStaked;
    }

    struct Phase {
        // Timestamp-based schedule
        uint256 start;
        uint256 end;
        uint256 bps; // annualized BPS (e.g., 1000 = 10%)
    }

    // ---------- Config ----------
    IOBNMintable public stakingToken;
    address public treasury;     // receives 1%
    address public charityFund;  // receives 1%
    string public version;

    // ---------- Emission schedule ----------
    Phase[] public phases;

    // ---------- Pools / Users ----------
    PoolInfo[] public poolInfo; // pid => PoolInfo

    mapping(uint256 => mapping(address => uint256)) public userAmount;     // pid => user => staked
    mapping(uint256 => mapping(address => uint256)) public userRewardDebt; // pid => user => debt vs acc

    // Per-pool accumulators
    mapping(uint256 => uint256) public accRewardPerShare; // pid => acc (1e12)
    mapping(uint256 => uint256) public lastRewardTime;    // pid => last accrual timestamp

    // ---------- Global ----------
    uint256 public globalTotalStaked;

    // ---------- Charity ----------
    uint256 public charityBuffer;                      // global buffer to be allocated
    mapping(uint256 => uint256) public charityAccrued; // per-pool allocation awaiting mint
    uint256 public charityCursor;                      // round-robin cursor (allocation only)

    // ---------- Permanent locks ----------
    mapping(uint256 => mapping(address => uint256)) public lockedAmount;

    // ---------- Stats ----------
    mapping(address => uint256) public totalClaimedByUser;
    mapping(address => uint256) public totalDepositedByUser;
    mapping(address => uint256) public totalWithdrawnByUser;

    mapping(uint256 => uint256) public totalDepositedByPool;
    mapping(uint256 => uint256) public totalWithdrawnByPool;
    mapping(uint256 => uint256) public totalCharityMintedByPool;

    // NEW: unique-staker counters
    mapping(uint256 => uint256) public uniqueStakersByPool;               // pid => count
    uint256 public uniqueStakersGlobal;                                   // global count
    mapping(uint256 => mapping(address => bool)) private _isActiveStaker; // pid => user => active>0

    // ---------- Events ----------
    event PoolAdded(uint256 indexed pid, address charityWallet);
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Claim(address indexed user, uint256 indexed pid, uint256 amount);
    event PhaseAdded(uint256 start, uint256 end, uint256 bps);

    event CharityBuffered(uint256 amount);
    event CharityAllocated(uint256 indexed pid, uint256 amount);
    event CharityDistributed(uint256 indexed pid, uint256 amount);
    event TreasuryDistributed(uint256 amount);
    event CharityFundDistributed(uint256 amount);

    event LockedAmountSet(uint256 indexed pid, address indexed user, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IOBNMintable stakingTokenArg,
        address treasuryAddr,
        address charityFundAddr
    ) public initializer {
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);

        require(address(stakingTokenArg) != address(0), "Invalid token");
        require(treasuryAddr != address(0), "Invalid treasury");
        require(charityFundAddr != address(0), "Invalid charity fund");

        stakingToken = stakingTokenArg;
        treasury = treasuryAddr;
        charityFund = charityFundAddr;
        version = "8.2.0-no-retire-no-active";

        // Local phases — timestamp schedule
        uint256 start = block.timestamp;
        uint256 year = 365 days;
        phases.push(Phase(start, start + 2 * year, 1000));            // 10%
        phases.push(Phase(start + 2 * year, start + 4 * year, 750));  // 7.5%
        phases.push(Phase(start + 4 * year, start + 6 * year, 500));  // 5%
        phases.push(Phase(start + 6 * year, start + 8 * year, 250));  // 2.5%
        phases.push(Phase(start + 8 * year, start + 10 * year, 125)); // 1.25%
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // =========================
    // Admin
    // =========================

    function addPool(address charityWallet) external onlyOwner {
        require(charityWallet != address(0), "Invalid charity");
        poolInfo.push(PoolInfo({charityWallet: charityWallet, totalStaked: 0}));
        uint256 pid = poolInfo.length - 1;
        lastRewardTime[pid] = block.timestamp; // init per-pool timer
        emit PoolAdded(pid, charityWallet);
    }

    /// @notice Add a new emission phase using timestamps.
    function addPhase(uint256 start, uint256 end, uint256 bps) external onlyOwner {
        require(start < end, "Invalid");
        uint256 len = phases.length;
        if (len > 0) {
            require(start >= phases[len - 1].end, "Must be contiguous");
        }
        phases.push(Phase(start, end, bps));
        emit PhaseAdded(start, end, bps);
    }

    function sweep(address token, uint256 amount) external onlyOwner {
        require(token != address(stakingToken), "Cannot sweep staking token");
        IERC20(token).safeTransfer(treasury, amount);
    }

    // ---------- Charity fund bootstrapping ----------
    /**
     * @notice Charity fund can stake for a beneficiary with the deposit permanently locked.
     *         Pulls tokens via transferFrom(charityFund -> this). Requires allowance.
     */
    function charityFundBootstrap(uint256 pid, uint256 amount, address beneficiary)
        external
        nonReentrant
    {
        require(msg.sender == charityFund, "Only charityFund");
        _depositFor(pid, amount, beneficiary, true); // lock this deposit permanently
    }

    // =========================
    // Permanent lock (admin)
    // =========================
    /**
     * @notice Owner may only INCREASE a user's locked amount (never decrease).
     *         Lock may still decrease automatically if the user's balance drops below it.
     */
    function setLockedAmount(uint256 pid, address user, uint256 amount) external onlyOwner {
        require(pid < poolInfo.length, "Invalid pool");
        uint256 bal = userAmount[pid][user];
        require(amount <= bal, "amount > balance");
        uint256 current = lockedAmount[pid][user];
        require(amount >= current, "cannot decrease lock");
        lockedAmount[pid][user] = amount;
        emit LockedAmountSet(pid, user, amount);
    }

    // =========================
    // Emissions / Accrual (timestamp-based)
    // =========================

    function currentRewardsPerSecond() public view returns (uint256) {
        if (globalTotalStaked == 0) return 0;
        uint256 nowTs = block.timestamp;
        uint256 len = phases.length;
        for (uint256 i = 0; i < len; i++) {
            Phase memory ph = phases[i];
            if (nowTs >= ph.start && nowTs < ph.end) {
                uint256 denom = TOTAL_BPS * (365 days);
                return Math.mulDiv(globalTotalStaked, ph.bps, denom);
            }
        }
        return 0;
    }

    /// @dev Sum raw gross reward for a pool across phases between [t0, t1).
    ///      NOTE: By construction, global stake cancels out:
    ///      reward_segment = duration * (global * bps / denom) * (pool/global) = duration * pool * bps / denom
    function _sumRewardAcrossPhases(uint256 t0, uint256 t1, uint256 poolStake) internal view returns (uint256 total) {
        if (t1 <= t0 || poolStake == 0) return 0;
        uint256 len = phases.length;
        if (len < 1) return 0;

        uint256 cursor = t0;
        uint256 denom = TOTAL_BPS * (365 days);

        for (uint256 i = 0; i < len && cursor < t1; i++) {
            Phase memory ph = phases[i];

            // Skip phases that end before cursor or start after t1
            if (ph.end <= cursor || ph.start >= t1) {
                continue;
            }

            uint256 segStart = cursor < ph.start ? ph.start : cursor;
            if (segStart >= t1) break;

            uint256 segEnd = ph.end < t1 ? ph.end : t1;
            if (segEnd <= segStart) {
                cursor = ph.end;
                continue;
            }

            uint256 dur = segEnd - segStart;
            // SAFER multiply ordering: total += poolStake * (ph.bps * dur) / denom
            total += Math.mulDiv(poolStake, ph.bps * dur, denom);

            cursor = segEnd;
        }
    }

    /// @dev Accrue rewards for a single pool (EFFECTS ONLY).
    ///      Returns (sCut, tCut, fCut). Charity (10%) is buffered globally.
    function _accruePool(uint256 pid) internal returns (uint256 sCut, uint256 tCut, uint256 fCut) {
        PoolInfo memory p = poolInfo[pid];

        uint256 last = lastRewardTime[pid];
        uint256 nowTs = block.timestamp;
        if (nowTs <= last) return (0, 0, 0);

        if (p.totalStaked == 0) {
            lastRewardTime[pid] = nowTs;
            return (0, 0, 0);
        }

        // Phase-accurate reward sum for this pool
        uint256 reward = _sumRewardAcrossPhases(last, nowTs, p.totalStaked);
        if (reward == 0) {
            lastRewardTime[pid] = nowTs;
            return (0, 0, 0);
        }

        uint256 cCut = Math.mulDiv(reward, CHARITY_BPS, TOTAL_BPS);      // 10% to buffer
        tCut = Math.mulDiv(reward, TREASURY_BPS, TOTAL_BPS);             // 1% to treasury
        fCut = Math.mulDiv(reward, CHARITY_FUND_BPS, TOTAL_BPS);         // 1% to charityFund
        sCut = reward - cCut - tCut - fCut;                              // 88% to stakers

        if (sCut > 0) {
            accRewardPerShare[pid] += Math.mulDiv(sCut, 1e12, p.totalStaked);
        }
        if (cCut > 0) {
            charityBuffer += cCut; // buffered globally
            emit CharityBuffered(cCut);
        }

        lastRewardTime[pid] = nowTs; // EFFECTS END
    }

    // =========================
    // Charity allocation (no external calls)
    // =========================

    function _allocateCharityForPid(uint256 pid) internal {
        if (charityBuffer > 0 && globalTotalStaked > 0) {
            PoolInfo memory p = poolInfo[pid];
            if (p.totalStaked > 0) {
                uint256 portion = Math.mulDiv(charityBuffer, p.totalStaked, globalTotalStaked);
                if (portion > 0) {
                    unchecked { charityBuffer -= portion; }
                    charityAccrued[pid] += portion;
                    emit CharityAllocated(pid, portion);
                }
            }
        }
    }

    /// @notice Allocate charity to up to `maxPools` pools using round-robin. No external calls.
    function distributeCharity(uint256 maxPools) external nonReentrant {
        uint256 len = poolInfo.length;
        if (len == 0 || charityBuffer == 0 || globalTotalStaked == 0 || maxPools == 0) return;

        uint256 startIdx = charityCursor % len;
        uint256 processed = (maxPools > len) ? len : maxPools;

        uint256 totalToSub = 0;
        for (uint256 step = 0; step < processed; step++) {
            uint256 pid = (startIdx + step) % len;
            PoolInfo memory p = poolInfo[pid];
            if (p.totalStaked == 0) continue;

            uint256 portion = Math.mulDiv(charityBuffer, p.totalStaked, globalTotalStaked);
            if (portion == 0) continue;

            charityAccrued[pid] += portion;
            totalToSub += portion;
            emit CharityAllocated(pid, portion);
        }

        if (totalToSub > 0) {
            unchecked { charityBuffer -= totalToSub; } // single subtraction after loop
        }

        charityCursor = (startIdx + processed) % len;
    }

    /// @notice Allocate charity only to provided `pids`. No external calls.
    function distributeCharityFor(uint256[] calldata pids) external nonReentrant {
        if (charityBuffer == 0 || globalTotalStaked == 0) return;

        uint256 totalToSub = 0;
        uint256 len = pids.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 pid = pids[i];
            require(pid < poolInfo.length, "Invalid pid");
            PoolInfo memory p = poolInfo[pid];
            if (p.totalStaked == 0) continue;

            uint256 portion = Math.mulDiv(charityBuffer, p.totalStaked, globalTotalStaked);
            if (portion == 0) continue;

            charityAccrued[pid] += portion;
            totalToSub += portion;
            emit CharityAllocated(pid, portion);
        }

        if (totalToSub > 0) {
            unchecked { charityBuffer -= totalToSub; } // single subtraction after loop
        }
    }

    // =========================
    // User actions — CEI with auto charity/treasury/charityFund mint
    // =========================

    function deposit(uint256 pid, uint256 amount) external nonReentrant {
        _depositFor(pid, amount, msg.sender, false);
    }

    function depositFor(uint256 pid, uint256 amount, address beneficiary)
        external
        nonReentrant
    {
        _depositFor(pid, amount, beneficiary, false);
    }

    function depositWithPermit(
        uint256 pid,
        uint256 amount,
        address beneficiary,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external nonReentrant {
        IERC20Permit(address(stakingToken)).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v, r, s
        );
        _depositFor(pid, amount, beneficiary, false);
    }

    /// @notice Locks the deposit amount permanently for the beneficiary.
    function depositForWithLock(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external nonReentrant {
        _depositFor(pid, amount, beneficiary, true);
    }

    function _depositFor(
        uint256 pid,
        uint256 amount,
        address beneficiary,
        bool lockThisDeposit
    ) internal {
        require(amount > 0, "Cannot stake 0");
        require(pid < poolInfo.length, "Invalid pool");
        require(beneficiary != address(0), "beneficiary=0");

        ( , uint256 tCut, uint256 fCut) = _accruePool(pid); // EFFECTS ONLY

        uint256 acc = accRewardPerShare[pid];
        uint256 balBefore = userAmount[pid][beneficiary];
        uint256 debtBefore = userRewardDebt[pid][beneficiary];
        uint256 pending = ((balBefore * acc) / 1e12) - debtBefore;

        // ---- UNIQUE STAKER ACCOUNTING (before balance change) ----
        if (balBefore == 0 && !_isActiveStaker[pid][beneficiary]) {
            _isActiveStaker[pid][beneficiary] = true;
            uniqueStakersByPool[pid] += 1;
            uniqueStakersGlobal += 1;
        }

        // EFFECTS: balances, debts, stats
        userAmount[pid][beneficiary] = balBefore + amount;
        poolInfo[pid].totalStaked   += amount;
        globalTotalStaked           += amount;
        totalDepositedByUser[beneficiary] += amount;
        totalDepositedByPool[pid]   += amount;
        userRewardDebt[pid][beneficiary] = ((balBefore + amount) * acc) / 1e12;

        if (lockThisDeposit) {
            lockedAmount[pid][beneficiary] += amount; // permanent increase
            emit LockedAmountSet(pid, beneficiary, lockedAmount[pid][beneficiary]);
        }

        // EFFECTS: allocate charity for this pool
        _allocateCharityForPid(pid);

        // EFFECTS: pre-debit charityAccrued for auto-mint
        uint256 charityToMint = charityAccrued[pid];
        if (charityToMint > 0) {
            charityAccrued[pid] = 0;
            totalCharityMintedByPool[pid] += charityToMint;
        }

        // EFFECTS: claimed stats before any external call
        if (pending > 0) {
            totalClaimedByUser[beneficiary] += pending;
        }

        // INTERACTIONS — no storage writes after this point
        if (charityToMint > 0) {
            address cw = poolInfo[pid].charityWallet;
            require(cw != address(0), "charity=0");
            stakingToken.mint(cw, charityToMint);
            emit CharityDistributed(pid, charityToMint);
        }

        // take stake tokens
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        // pay staker pending
        if (pending > 0) {
            stakingToken.mint(beneficiary, pending);
            emit Claim(beneficiary, pid, pending);
        }
        // global 1% + 1% slices
        if (tCut > 0) {
            stakingToken.mint(treasury, tCut);
            emit TreasuryDistributed(tCut);
        }
        if (fCut > 0) {
            stakingToken.mint(charityFund, fCut);
            emit CharityFundDistributed(fCut);
        }

        emit Deposit(beneficiary, pid, amount);
    }

    function withdraw(uint256 pid, uint256 amount) external nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(amount > 0, "Zero amount");
        uint256 userBal = userAmount[pid][msg.sender];
        require(userBal >= amount, "Exceeds staked");

        uint256 locked = lockedAmount[pid][msg.sender];
        if (locked > userBal) locked = userBal;
        uint256 available = userBal - locked;
        require(amount <= available, "amount exceeds unlocked");

        ( , uint256 tCut, uint256 fCut) = _accruePool(pid); // EFFECTS ONLY

        uint256 acc = accRewardPerShare[pid];
        uint256 debt = userRewardDebt[pid][msg.sender];
        uint256 pending = ((userBal * acc) / 1e12) - debt;

        // EFFECTS
        uint256 newBal = userBal - amount;
        userAmount[pid][msg.sender] = newBal;
        poolInfo[pid].totalStaked   -= amount;
        globalTotalStaked           -= amount;
        totalWithdrawnByUser[msg.sender] += amount;
        totalWithdrawnByPool[pid]        += amount;

        if (lockedAmount[pid][msg.sender] > newBal) {
            lockedAmount[pid][msg.sender] = newBal; // auto-shrink lock if needed
            emit LockedAmountSet(pid, msg.sender, newBal);
        }

        // ---- UNIQUE STAKER ACCOUNTING (after balance change) ----
        if (newBal == 0 && _isActiveStaker[pid][msg.sender]) {
            _isActiveStaker[pid][msg.sender] = false;
            uniqueStakersByPool[pid] -= 1;
            uniqueStakersGlobal -= 1;
        }

        userRewardDebt[pid][msg.sender] = (newBal * acc) / 1e12;

        // EFFECTS: allocate charity for this pool
        _allocateCharityForPid(pid);

        // EFFECTS: pre-debit charityAccrued for auto-mint
        uint256 charityToMint = charityAccrued[pid];
        if (charityToMint > 0) {
            charityAccrued[pid] = 0;
            totalCharityMintedByPool[pid] += charityToMint;
        }

        // EFFECTS: claimed stats before external calls
        if (pending > 0) {
            totalClaimedByUser[msg.sender] += pending;
        }

        // INTERACTIONS — no storage writes after this point
        if (charityToMint > 0) {
            address cw = poolInfo[pid].charityWallet;
            require(cw != address(0), "charity=0");
            stakingToken.mint(cw, charityToMint);
            emit CharityDistributed(pid, charityToMint);
        }

        stakingToken.safeTransfer(msg.sender, amount);

        if (pending > 0) {
            stakingToken.mint(msg.sender, pending);
            emit Claim(msg.sender, pid, pending);
        }
        if (tCut > 0) {
            stakingToken.mint(treasury, tCut);
            emit TreasuryDistributed(tCut);
        }
        if (fCut > 0) {
            stakingToken.mint(charityFund, fCut);
            emit CharityFundDistributed(fCut);
        }

        emit Withdraw(msg.sender, pid, amount);
    }

    function claim(uint256 pid) external nonReentrant {
        _claimTo(pid, msg.sender);
    }

    function claimFor(uint256 pid, address user) external nonReentrant {
        _claimTo(pid, user);
    }

    function _claimTo(uint256 pid, address user) internal {
        require(pid < poolInfo.length, "Invalid pool");

        ( , uint256 tCut, uint256 fCut) = _accruePool(pid); // EFFECTS ONLY

        uint256 acc = accRewardPerShare[pid];
        uint256 bal = userAmount[pid][user];
        uint256 debt = userRewardDebt[pid][user];
        uint256 pending = ((bal * acc) / 1e12) - debt;

        // EFFECTS
        userRewardDebt[pid][user] = (bal * acc) / 1e12;
        if (pending > 0) {
            totalClaimedByUser[user] += pending;
        }

        // EFFECTS: allocate charity for this pool
        _allocateCharityForPid(pid);

        // EFFECTS: pre-debit charityAccrued for auto-mint
        uint256 charityToMint = charityAccrued[pid];
        if (charityToMint > 0) {
            charityAccrued[pid] = 0;
            totalCharityMintedByPool[pid] += charityToMint;
        }

        // INTERACTIONS — no storage writes after this point
        if (charityToMint > 0) {
            address cw = poolInfo[pid].charityWallet;
            require(cw != address(0), "charity=0");
            stakingToken.mint(cw, charityToMint);
            emit CharityDistributed(pid, charityToMint);
        }

        if (pending > 0) {
            stakingToken.mint(user, pending);
            emit Claim(user, pid, pending);
        }
        if (tCut > 0) {
            stakingToken.mint(treasury, tCut);
            emit TreasuryDistributed(tCut);
        }
        if (fCut > 0) {
            stakingToken.mint(charityFund, fCut);
            emit CharityFundDistributed(fCut);
        }
    }

    // =========================
    // Views (timestamp-based)
    // =========================

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function getPoolInfo(uint256 pid) external view returns (address charityWallet, uint256 totalStaked) {
        PoolInfo memory p = poolInfo[pid];
        return (p.charityWallet, p.totalStaked);
    }

    function getUserStakeValue(uint256 pid, address userAddr) external view returns (uint256) {
        return userAmount[pid][userAddr];
    }

    function unlockedBalance(uint256 pid, address user) external view returns (uint256) {
        uint256 bal = userAmount[pid][user];
        uint256 lock = lockedAmount[pid][user];
        if (lock > bal) lock = bal;
        return bal - lock;
    }

    function pendingRewards(uint256 pid, address userAddr) external view returns (uint256) {
        PoolInfo memory p = poolInfo[pid];
        uint256 acc = accRewardPerShare[pid];
        uint256 last = lastRewardTime[pid];

        if (block.timestamp > last && p.totalStaked != 0) {
            uint256 reward = _sumRewardAcrossPhases(last, block.timestamp, p.totalStaked);
            if (reward > 0) {
                uint256 nonStakerBps = CHARITY_BPS + TREASURY_BPS + CHARITY_FUND_BPS;
                uint256 sCut = reward - Math.mulDiv(reward, nonStakerBps, TOTAL_BPS);
                acc += Math.mulDiv(sCut, 1e12, p.totalStaked);
            }
        }

        uint256 bal = userAmount[pid][userAddr];
        uint256 debt = userRewardDebt[pid][userAddr];
        return ((bal * acc) / 1e12) - debt;
    }

    function getPoolAPR(uint256 pid) external view returns (uint256 aprBps) {
        PoolInfo memory p = poolInfo[pid];
        if (p.totalStaked == 0) return 0;

        uint256 start = block.timestamp;
        uint256 end   = start + 365 days;

        // Yearly gross rewards for this pool using phase-accurate math
        uint256 yearlyPoolGross = _sumRewardAcrossPhases(start, end, p.totalStaked);
        if (yearlyPoolGross == 0) return 0;

        // APR in BPS for stakers in this pool:
        // ((yearlyPoolGross * STAKER_BPS / TOTAL_BPS) / p.totalStaked) * TOTAL_BPS
        uint256 stakerYearly = Math.mulDiv(yearlyPoolGross, STAKER_BPS, TOTAL_BPS);
        return Math.mulDiv(stakerYearly, TOTAL_BPS, p.totalStaked);
    }

    function getUserStats(address userAddr) external view returns (
        uint256 totalUserStaked,
        uint256 totalUserClaimed,
        uint256 totalUserDeposited,
        uint256 totalUserWithdrawn,
        uint256 poolCount
    ) {
        uint256 len = poolInfo.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 amt = userAmount[i][userAddr];
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

    function pendingCharityFor(uint256 pid) external view returns (uint256) {
        if (pid >= poolInfo.length) return 0;
        PoolInfo memory p = poolInfo[pid];

        // Always include what's already accrued for this pid
        uint256 accruedForPid = charityAccrued[pid];

        // If TVL is zero, don't simulate further; return accrued
        if (p.totalStaked == 0) {
            return accruedForPid;
        }

        // Include fair share of current global buffer + this interval's charity cut (virtual, across phases)
        uint256 accGlobal = charityBuffer;
        uint256 last = lastRewardTime[pid];
        if (block.timestamp > last) {
            uint256 reward = _sumRewardAcrossPhases(last, block.timestamp, p.totalStaked);
            if (reward > 0) {
                uint256 cCut = Math.mulDiv(reward, CHARITY_BPS, TOTAL_BPS);
                accGlobal += cCut;
            }
        }

        uint256 shareOfGlobal = 0;
        if (globalTotalStaked > 0) {
            shareOfGlobal = Math.mulDiv(accGlobal, p.totalStaked, globalTotalStaked);
        }

        // Guarantee result >= already-accrued amount
        uint256 candidate = accruedForPid + shareOfGlobal;
        return candidate >= accruedForPid ? candidate : accruedForPid;
    }

    function _viewRps() internal view returns (uint256) {
        if (globalTotalStaked == 0) return 0;
        uint256 nowTs = block.timestamp;
        uint256 len = phases.length;
        for (uint256 i = 0; i < len; i++) {
            Phase memory ph = phases[i];
            if (nowTs >= ph.start && nowTs < ph.end) {
                uint256 denom = TOTAL_BPS * (365 days);
                return Math.mulDiv(globalTotalStaked, ph.bps, denom);
            }
        }
        return 0;
    }

    // ====== NEW DASHBOARD HELPERS ======

    /// @notice Global snapshot useful for dashboards.
    function getGlobalStats()
        external
        view
        returns (
            uint256 poolCount,
            uint256 totalStaked_,
            uint256 uniqueStakers_,
            uint256 charityBuffer_,
            uint256 rps
        )
    {
        poolCount       = poolInfo.length;
        totalStaked_    = globalTotalStaked;
        uniqueStakers_  = uniqueStakersGlobal;
        charityBuffer_  = charityBuffer;
        rps             = _viewRps();
    }

    /// @notice Pool snapshot including unique stakers.
    function getPoolStats(uint256 pid)
        external
        view
        returns (
            address charityWallet,
            uint256 totalStaked,
            uint256 uniqueStakers,
            uint256 accPerShare,
            uint256 lastTime,
            uint256 accruedCharity,
            uint256 depositedAllTime,
            uint256 withdrawnAllTime,
            uint256 charityMintedAllTime
        )
    {
        require(pid < poolInfo.length, "Invalid pool");
        PoolInfo memory p = poolInfo[pid];
        charityWallet        = p.charityWallet;
        totalStaked          = p.totalStaked;
        uniqueStakers        = uniqueStakersByPool[pid];
        accPerShare          = accRewardPerShare[pid];
        lastTime             = lastRewardTime[pid];
        accruedCharity       = charityAccrued[pid];
        depositedAllTime     = totalDepositedByPool[pid];
        withdrawnAllTime     = totalWithdrawnByPool[pid];
        charityMintedAllTime = totalCharityMintedByPool[pid];
    }

    /// @notice User view for a given pool (single call for UI).
    function getUserPoolView(uint256 pid, address user)
        external
        view
        returns (
            uint256 staked,
            uint256 locked,
            uint256 unlocked,
            uint256 rewardDebt,
            uint256 pending,
            bool isActive
        )
    {
        require(pid < poolInfo.length, "Invalid pool");
        staked     = userAmount[pid][user];
        locked     = lockedAmount[pid][user];
        if (locked > staked) locked = staked;
        unlocked   = staked - locked;
        rewardDebt = userRewardDebt[pid][user];

        // simulate pending based on current acc and latest accrual if TVL>0
        uint256 acc = accRewardPerShare[pid];
        PoolInfo memory p = poolInfo[pid];
        uint256 last = lastRewardTime[pid];

        if (block.timestamp > last && p.totalStaked != 0) {
            uint256 reward = _sumRewardAcrossPhases(last, block.timestamp, p.totalStaked);
            if (reward > 0) {
                uint256 nonStakerBps = CHARITY_BPS + TREASURY_BPS + CHARITY_FUND_BPS;
                uint256 sCut = reward - Math.mulDiv(reward, nonStakerBps, TOTAL_BPS);
                acc += Math.mulDiv(sCut, 1e12, p.totalStaked);
            }
        }

        pending = ((staked * acc) / 1e12) - rewardDebt;
        isActive = _isActiveStaker[pid][user];
    }

    /// @notice Compact list of all pools for UIs (parallel arrays).
    function listPoolsBasic()
        external
        view
        returns (
            address[] memory charityWallets,
            uint256[] memory totals,
            uint256[] memory uniqueCounts
        )
    {
        uint256 len = poolInfo.length;
        charityWallets = new address[](len);
        totals         = new uint256[](len);
        uniqueCounts   = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            PoolInfo memory p = poolInfo[i];
            charityWallets[i] = p.charityWallet;
            totals[i]         = p.totalStaked;
            uniqueCounts[i]   = uniqueStakersByPool[i];
        }
    }

    // ---- storage gap for future upgrades ----
    uint256[100] private __gap;
}