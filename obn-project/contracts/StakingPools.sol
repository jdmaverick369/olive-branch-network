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
import "./interfaces/IStakingPools.sol";

/**
 * @title OBNStakingPools
 * @notice Timestamp-based emissions with fixed 4-way split:
 *         88% stakers, 10% charity (per-pool accrual), 1% charity fund, 1% treasury.
 *         Per-pool accumulators; equal APR/token across pools.
 *         CEI + nonReentrant on mutating functions.
 *
 */
contract OBNStakingPools is
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    IStakingPools
{
    using SafeERC20 for IOBNMintable;
    using SafeERC20 for IERC20;

    // ---------- Fixed split (BPS) ----------
    uint256 public constant STAKER_BPS       = 8800; // 88%
    uint256 public constant CHARITY_BPS      = 1000; // 10% (per-pool accrual)
    uint256 public constant CHARITY_FUND_BPS = 100;  // 1%
    uint256 public constant TREASURY_BPS     = 100;  // 1%
    uint256 public constant TOTAL_BPS        = 10000;

    // ---------- Types ----------
    struct PoolInfo {
        address charityWallet;
        uint256 totalStaked;
    }

    struct Phase {
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

    // ---------- Charity (per-pool) ----------
    mapping(uint256 => uint256) public charityAccrued; // per-pool allocation awaiting mint

    // ---------- Permanent locks ----------
    mapping(uint256 => mapping(address => uint256)) public lockedAmount;

    // ---------- Stats ----------
    mapping(address => uint256) public totalClaimedByUser;
    mapping(address => uint256) public totalDepositedByUser;
    mapping(address => uint256) public totalWithdrawnByUser;

    mapping(uint256 => uint256) public totalDepositedByPool;
    mapping(uint256 => uint256) public totalWithdrawnByPool;
    mapping(uint256 => uint256) public totalCharityMintedByPool;

    mapping(uint256 => uint256) public uniqueStakersByPool;               // pid => count
    uint256 public uniqueStakersGlobal;                                   // count of addresses with activePoolCount > 0 (true global uniques)
    mapping(uint256 => mapping(address => bool)) private _isActiveStaker; // pid => user => active>0

    /// @notice Number of pools in which a user currently has a non-zero stake.
    mapping(address => uint256) public activePoolCount;
    /// @notice Timestamp when a user first became globally staked (activePoolCount moved 0 -> 1). Resets to 0 when it returns to 0.
    mapping(address => uint64) public stakedSince;

    // ==== Persistent cumulative staking time (does NOT reset on full unstake) ====
    mapping(address => uint256) public cumulativeStakeSeconds;

    // ---------- Events ----------
    event PoolAdded(uint256 indexed pid, address charityWallet);
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Claim(address indexed user, uint256 indexed pid, uint256 amount);
    event PhaseAdded(uint256 start, uint256 end, uint256 bps);

    event CharityAllocated(uint256 indexed pid, uint256 amount);    // accrued to pool
    event CharityDistributed(uint256 indexed pid, uint256 amount);  // minted to pool charity
    event TreasuryDistributed(uint256 amount);
    event CharityFundDistributed(uint256 amount);

    event LockedAmountSet(uint256 indexed pid, address indexed user, uint256 amount);

    // NEW: ability to update charity wallet for a pool
    event CharityWalletUpdated(uint256 indexed pid, address indexed oldWallet, address indexed newWallet);

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
        version = "8.5.0-perpool-charity-clean";

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

    /// @notice Update the charity wallet for a pool (e.g., if compromised or rotating wallets).
    function updateCharityWallet(uint256 pid, address newWallet) external onlyOwner {
        require(pid < poolInfo.length, "Invalid pool");
        require(newWallet != address(0), "Invalid wallet");
        address old = poolInfo[pid].charityWallet;
        require(newWallet != old, "Same wallet");
        poolInfo[pid].charityWallet = newWallet;
        emit CharityWalletUpdated(pid, old, newWallet);
    }

    /// @notice CharityFund may only INCREASE a user's locked amount (never decrease).
    ///         Lock may still decrease automatically if the user's balance drops below it.
    function setLockedAmount(uint256 pid, address user, uint256 amount) external {
        require(msg.sender == charityFund, "Only charityFund");
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

    /// Sum raw gross reward for a pool across phases between [t0, t1).
    function _sumRewardAcrossPhases(uint256 t0, uint256 t1, uint256 poolStake) internal view returns (uint256 total) {
        if (t1 <= t0 || poolStake == 0) return 0;
        uint256 len = phases.length;
        if (len < 1) return 0;

        uint256 cursor = t0;
        uint256 denom = TOTAL_BPS * (365 days);

        for (uint256 i = 0; i < len && cursor < t1; i++) {
            Phase memory ph = phases[i];

            if (ph.end <= cursor || ph.start >= t1) continue;

            uint256 segStart = cursor < ph.start ? ph.start : cursor;
            if (segStart >= t1) break;

            uint256 segEnd = ph.end < t1 ? ph.end : t1;
            if (segEnd <= segStart) { cursor = ph.end; continue; }

            uint256 dur = segEnd - segStart;
            total += Math.mulDiv(poolStake, ph.bps * dur, denom);
            cursor = segEnd;
        }
    }

    /// Accrue rewards for a single pool (EFFECTS ONLY).
    function _accruePool(uint256 pid) internal returns (uint256 sCut, uint256 tCut, uint256 fCut) {
        PoolInfo memory p = poolInfo[pid];

        uint256 last = lastRewardTime[pid];
        uint256 nowTs = block.timestamp;
        if (nowTs <= last) return (0, 0, 0);

        if (p.totalStaked == 0) {
            lastRewardTime[pid] = nowTs;
            return (0, 0, 0);
        }

        uint256 reward = _sumRewardAcrossPhases(last, nowTs, p.totalStaked);
        if (reward == 0) {
            lastRewardTime[pid] = nowTs;
            return (0, 0, 0);
        }

        uint256 cCut = Math.mulDiv(reward, CHARITY_BPS, TOTAL_BPS); // 10%
        tCut = Math.mulDiv(reward, TREASURY_BPS, TOTAL_BPS);        // 1%
        fCut = Math.mulDiv(reward, CHARITY_FUND_BPS, TOTAL_BPS);    // 1%
        sCut = reward - cCut - tCut - fCut;                         // 88%

        if (sCut > 0) accRewardPerShare[pid] += Math.mulDiv(sCut, 1e12, p.totalStaked);
        if (cCut > 0) {
            charityAccrued[pid] += cCut;        // accrue charity directly to this pool
            emit CharityAllocated(pid, cCut);
        }

        lastRewardTime[pid] = nowTs;
    }

    // =========================
    // User actions — CEI with auto charity/treasury/charityFund mint
    // =========================

    function deposit(uint256 pid, uint256 amount) external nonReentrant {
        _depositCore(pid, amount, msg.sender, false);
    }

    function depositFor(uint256 pid, uint256 amount, address beneficiary)
        external
        nonReentrant
    {
        _depositCore(pid, amount, beneficiary, false);
    }

    // Reentrancy-friendly (effects before external calls)
    function depositWithPermit(
        uint256 pid,
        uint256 amount,
        address beneficiary,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external nonReentrant {
        _depositCorePermit(pid, amount, beneficiary, false, deadline, v, r, s);
    }

    /// Only the charityFund is allowed to create permanently locked deposits.
    function depositForWithLock(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external nonReentrant {
        require(msg.sender == charityFund, "Only charityFund");
        _depositCore(pid, amount, beneficiary, true);
    }

    /// Convenience wrapper kept for parity with older interfaces.
    function charityFundBootstrap(uint256 pid, uint256 amount, address beneficiary)
        external
        nonReentrant
    {
        require(msg.sender == charityFund, "Only charityFund");
        _depositCore(pid, amount, beneficiary, true);
    }

    // ---------- Internal helpers to reduce cyclomatic complexity ----------

    struct DepCalcs {
        uint256 acc;
        uint256 balBefore;
        uint256 debtBefore;
        uint256 pending;
        uint256 tCut;
        uint256 fCut;
    }

    function _accrueAndComputePending(uint256 pid, address user) internal returns (DepCalcs memory d) {
        ( , d.tCut, d.fCut) = _accruePool(pid);
        d.acc        = accRewardPerShare[pid];
        d.balBefore  = userAmount[pid][user];
        d.debtBefore = userRewardDebt[pid][user];
        d.pending    = ((d.balBefore * d.acc) / 1e12) - d.debtBefore;
    }

    function _accountUniqueStaker(uint256 pid, address user, uint256 balBefore) internal {
        if (balBefore == 0 && !_isActiveStaker[pid][user]) {
            _isActiveStaker[pid][user] = true;
            uniqueStakersByPool[pid] += 1;
            // NOTE: uniqueStakersGlobal is now managed solely by global activePoolCount transitions (0->1 / 1->0)
        }
    }

    function _bumpBalancesOnDeposit(uint256 pid, address user, uint256 amount, uint256 acc, uint256 balBefore) internal {
        userAmount[pid][user] = balBefore + amount;
        poolInfo[pid].totalStaked   += amount;
        globalTotalStaked           += amount;
        totalDepositedByUser[user]  += amount;
        totalDepositedByPool[pid]   += amount;
        userRewardDebt[pid][user]    = ((balBefore + amount) * acc) / 1e12;
    }

    function _updateGlobalStakeOnNewPool(address user, uint256 balBefore) internal {
        if (balBefore == 0) {
            uint256 prev = activePoolCount[user];
            activePoolCount[user] = prev + 1;
            if (prev == 0) {
                stakedSince[user] = uint64(block.timestamp);
                uniqueStakersGlobal += 1; // (2) increment only when user becomes globally active
            }
        }
    }

    function _applyLockIfNeeded(uint256 pid, address user, uint256 amount, bool lockThisDeposit) internal {
        if (lockThisDeposit) {
            require(msg.sender == charityFund, "Only charityFund");
            lockedAmount[pid][user] += amount;
            emit LockedAmountSet(pid, user, lockedAmount[pid][user]);
        }
    }

    function _allocateAndPredebitCharity(uint256 pid) internal returns (uint256 charityToMint) {
        // Read and clear this pool's accrued charity; mint after effects.
        charityToMint = charityAccrued[pid];
        if (charityToMint > 0) {
            charityAccrued[pid] = 0;
            totalCharityMintedByPool[pid] += charityToMint;
        }
    }

    function _bookClaimed(address user, uint256 pending) internal {
        if (pending > 0) {
            totalClaimedByUser[user] += pending;
        }
    }

    function _mintCharityIfAny(uint256 pid, uint256 charityToMint) internal {
        if (charityToMint > 0) {
            address cw = poolInfo[pid].charityWallet;
            require(cw != address(0), "charity=0");
            stakingToken.mint(cw, charityToMint);
            emit CharityDistributed(pid, charityToMint);
        }
    }

    function _mintSlices(address to, uint256 pending, uint256 tCut, uint256 fCut, uint256 pid) internal {
        if (pending > 0) {
            stakingToken.mint(to, pending);
            emit Claim(to, pid, pending);
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

    // --- Core deposit without permit (thin wrapper) ---
    function _depositCore(uint256 pid, uint256 amount, address beneficiary, bool lockThisDeposit) internal {
        require(amount > 0, "Cannot stake 0");
        require(pid < poolInfo.length, "Invalid pool");
        require(beneficiary != address(0), "beneficiary=0");

        DepCalcs memory d = _accrueAndComputePending(pid, beneficiary);

        _accountUniqueStaker(pid, beneficiary, d.balBefore);
        _bumpBalancesOnDeposit(pid, beneficiary, amount, d.acc, d.balBefore);
        _updateGlobalStakeOnNewPool(beneficiary, d.balBefore);
        _applyLockIfNeeded(pid, beneficiary, amount, lockThisDeposit);

        uint256 charityToMint = _allocateAndPredebitCharity(pid);
        _bookClaimed(beneficiary, d.pending);

        // INTERACTIONS
        _mintCharityIfAny(pid, charityToMint);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        _mintSlices(beneficiary, d.pending, d.tCut, d.fCut, pid);

        emit Deposit(beneficiary, pid, amount);
    }

    // --- Core deposit with permit (thin wrapper) ---
    function _depositCorePermit(
        uint256 pid,
        uint256 amount,
        address beneficiary,
        bool lockThisDeposit,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) internal {
        require(amount > 0, "Cannot stake 0");
        require(pid < poolInfo.length, "Invalid pool");
        require(beneficiary != address(0), "beneficiary=0");

        DepCalcs memory d = _accrueAndComputePending(pid, beneficiary);

        _accountUniqueStaker(pid, beneficiary, d.balBefore);
        _bumpBalancesOnDeposit(pid, beneficiary, amount, d.acc, d.balBefore);
        _updateGlobalStakeOnNewPool(beneficiary, d.balBefore);
        _applyLockIfNeeded(pid, beneficiary, amount, lockThisDeposit);

        uint256 charityToMint = _allocateAndPredebitCharity(pid);
        _bookClaimed(beneficiary, d.pending);

        // INTERACTIONS (permit after effects)
        _mintCharityIfAny(pid, charityToMint);

        IERC20Permit(address(stakingToken)).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v, r, s
        );

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        _mintSlices(beneficiary, d.pending, d.tCut, d.fCut, pid);

        emit Deposit(beneficiary, pid, amount);
    }

    // ---------- Withdraw / Claim ----------

    struct WLocals {
        uint256 userBal;
        uint256 locked;
        uint256 available;
        uint256 acc;
        uint256 debt;
        uint256 pending;
        uint256 newBal;
        uint256 tCut;
        uint256 fCut;
        uint256 charityToMint;
    }

    function _loadAndCheckWithdraw(uint256 pid, address user, uint256 amount)
        internal
        view
        returns (uint256 userBal, uint256 locked, uint256 available)
    {
        userBal = userAmount[pid][user];
        require(userBal >= amount, "Exceeds staked");

        locked = lockedAmount[pid][user];
        if (locked > userBal) locked = userBal;
        available = userBal - locked;
        require(amount <= available, "amount exceeds unlocked");
    }

    function _afterWithdrawBalanceHooks(uint256 pid, address user, uint256 newBal) internal {
        if (lockedAmount[pid][user] > newBal) {
            lockedAmount[pid][user] = newBal;
            emit LockedAmountSet(pid, user, newBal);
        }

        if (newBal == 0 && _isActiveStaker[pid][user]) {
            _isActiveStaker[pid][user] = false;
            uniqueStakersByPool[pid] -= 1;
            // NOTE: do not touch uniqueStakersGlobal here; handle it on global 1->0 transition below
        }

        if (newBal == 0) {
            uint256 prev = activePoolCount[user];
            if (prev > 0) {
                uint256 next = prev - 1;
                activePoolCount[user] = next;
                if (next == 0) {
                    uint64 since = stakedSince[user];
                    if (since != 0) {
                        cumulativeStakeSeconds[user] += (block.timestamp - uint256(since));
                    }
                    stakedSince[user] = 0;
                    uniqueStakersGlobal -= 1; // (2) decrement only when user becomes globally inactive
                }
            }
        }
    }

    function withdraw(uint256 pid, uint256 amount) external nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(amount > 0, "Zero amount");

        WLocals memory w = WLocals({
            userBal: 0,
            locked: 0,
            available: 0,
            acc: 0,
            debt: 0,
            pending: 0,
            newBal: 0,
            tCut: 0,
            fCut: 0,
            charityToMint: 0
        });

        (w.userBal, w.locked, w.available) = _loadAndCheckWithdraw(pid, msg.sender, amount);
        ( , w.tCut, w.fCut) = _accruePool(pid);

        w.acc     = accRewardPerShare[pid];
        w.debt    = userRewardDebt[pid][msg.sender];
        w.pending = ((w.userBal * w.acc) / 1e12) - w.debt;

        // EFFECTS
        w.newBal = w.userBal - amount;
        userAmount[pid][msg.sender] = w.newBal;
        poolInfo[pid].totalStaked   -= amount;
        globalTotalStaked           -= amount;
        totalWithdrawnByUser[msg.sender] += amount;
        totalWithdrawnByPool[pid]        += amount;

        _afterWithdrawBalanceHooks(pid, msg.sender, w.newBal);

        userRewardDebt[pid][msg.sender] = (w.newBal * w.acc) / 1e12;

        w.charityToMint = _allocateAndPredebitCharity(pid);

        if (w.pending > 0) {
            totalClaimedByUser[msg.sender] += w.pending;
        }

        // INTERACTIONS
        _mintCharityIfAny(pid, w.charityToMint);
        stakingToken.safeTransfer(msg.sender, amount);
        _mintSlices(msg.sender, w.pending, w.tCut, w.fCut, pid);

        emit Withdraw(msg.sender, pid, amount);
    }

    function claim(uint256 pid) external nonReentrant {
        _claimTo(pid, msg.sender);
    }

    struct CLocals {
        uint256 acc;
        uint256 bal;
        uint256 debt;
        uint256 pending;
        uint256 tCut;
        uint256 fCut;
        uint256 charityToMint;
    }

    function claimFor(uint256 pid, address user) external nonReentrant {
        _claimTo(pid, user);
    }

    function _claimTo(uint256 pid, address user) internal {
        require(pid < poolInfo.length, "Invalid pool");

        CLocals memory c = CLocals({
            acc: 0,
            bal: 0,
            debt: 0,
            pending: 0,
            tCut: 0,
            fCut: 0,
            charityToMint: 0
        });

        ( , c.tCut, c.fCut) = _accruePool(pid);

        c.acc     = accRewardPerShare[pid];
        c.bal     = userAmount[pid][user];
        c.debt    = userRewardDebt[pid][user];
        c.pending = ((c.bal * c.acc) / 1e12) - c.debt;

        // EFFECTS
        userRewardDebt[pid][user] = (c.bal * c.acc) / 1e12;
        if (c.pending > 0) {
            totalClaimedByUser[user] += c.pending;
        }

        c.charityToMint = _allocateAndPredebitCharity(pid);

        // INTERACTIONS
        _mintCharityIfAny(pid, c.charityToMint);
        _mintSlices(user, c.pending, c.tCut, c.fCut, pid);
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

        uint256 yearlyPoolGross = _sumRewardAcrossPhases(start, end, p.totalStaked);
        if (yearlyPoolGross == 0) return 0;

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

    /// @notice View how much charity is pending to be minted for a pool if we accrued right now.
    ///         Equals already-accrued `charityAccrued[pid]` + new cCut since lastRewardTime.
    function pendingCharityFor(uint256 pid) external view returns (uint256) {
        if (pid >= poolInfo.length) return 0;
        PoolInfo memory p = poolInfo[pid];

        uint256 accruedForPid = charityAccrued[pid];
        if (p.totalStaked == 0) {
            return accruedForPid;
        }

        uint256 last = lastRewardTime[pid];
        if (block.timestamp > last) {
            uint256 reward = _sumRewardAcrossPhases(last, block.timestamp, p.totalStaked);
            if (reward > 0) {
                uint256 cCut = Math.mulDiv(reward, CHARITY_BPS, TOTAL_BPS);
                accruedForPid += cCut;
            }
        }
        return accruedForPid;
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

    // ====== DASHBOARD HELPERS ======

    function getGlobalStats()
        external
        view
        returns (
            uint256 poolCount,
            uint256 totalStaked_,
            uint256 uniqueStakers_,
            uint256 rps
        )
    {
        poolCount       = poolInfo.length;
        totalStaked_    = globalTotalStaked;
        uniqueStakers_  = uniqueStakersGlobal; // true global uniques (activePoolCount > 0)
        rps             = _viewRps();
    }

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

    function isGloballyStaked(address user) external view returns (bool) {
        return activePoolCount[user] > 0;
    }

    /// Total staking seconds including current session if active (for XP bar / NFT gating)
    function stakeElapsed(address user) external view returns (uint256) {
        uint256 cum = cumulativeStakeSeconds[user];
        uint64 since = stakedSince[user];
        if (since != 0) {
            cum += block.timestamp - uint256(since);
        }
        return cum;
    }

    // ---- storage gap for future upgrades ----
    uint256[100] private __gap;
}
