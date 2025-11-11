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
 * @notice Timestamp-based emissions where each user's pending reward is the GROSS amount.
 *         On claim/deposit/withdraw we mint: 88% to user, 10% to pool charity,
 *         1% to charity fund, 1% to treasury.
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
    uint256 public constant CHARITY_BPS      = 1000; // 10%
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
    mapping(uint256 => uint256) public accRewardPerShare; // pid => acc (1e12), now GROSS
    mapping(uint256 => uint256) public lastRewardTime;    // pid => last accrual timestamp

    // ---------- Global ----------
    uint256 public globalTotalStaked;

    // ---------- Charity (legacy per-pool accrual kept for layout/back-compat) ----------
    mapping(uint256 => uint256) public charityAccrued; // legacy bucket (no longer increments)

    // ---------- Permanent locks ----------
    mapping(uint256 => mapping(address => uint256)) public lockedAmount;

    // ---------- Stats ----------
    mapping(address => uint256) public totalClaimedByUser; // tracks ONLY what was minted to user
    mapping(address => uint256) public totalDepositedByUser;
    mapping(address => uint256) public totalWithdrawnByUser;

    mapping(uint256 => uint256) public totalDepositedByPool;
    mapping(uint256 => uint256) public totalWithdrawnByPool;
    mapping(uint256 => uint256) public totalCharityMintedByPool;

    mapping(uint256 => uint256) public uniqueStakersByPool;               // pid => count
    uint256 public uniqueStakersGlobal;                                   // count of addresses with activePoolCount > 0
    mapping(uint256 => mapping(address => bool)) private _isActiveStaker; // pid => user => active>0

    /// @notice Number of pools in which a user currently has a non-zero stake.
    mapping(address => uint256) public activePoolCount;
    /// @notice Timestamp when a user first became globally staked (activePoolCount moved 0 -> 1). Resets to 0 when it returns to 0.
    mapping(address => uint64) public stakedSince;

    // ==== Persistent cumulative staking time (does NOT reset on full unstake) ====
    mapping(address => uint256) public cumulativeStakeSeconds;

    // ---------- Pool lifecycle (shutdown/remove) ----------
    mapping(uint256 => bool) public poolRemoved; // true => deposits disabled; removal requires totalStaked==0

    // ---------- Events ----------
    event PoolAdded(uint256 indexed pid, address charityWallet);
    event PoolShutdown(uint256 indexed pid); // deposits disabled; claims/withdraws allowed
    event PoolRemoved(uint256 indexed pid);  // soft delete after empty
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Claim(address indexed user, uint256 indexed pid, uint256 amountUser); // amount minted to user
    event PhaseAdded(uint256 start, uint256 end, uint256 bps);

    event CharityAllocated(uint256 indexed pid, uint256 amount);    // legacy (not used by new accrual)
    event CharityDistributed(uint256 indexed pid, uint256 amount);  // minted to pool charity
    event TreasuryDistributed(uint256 amount);
    event CharityFundDistributed(uint256 amount);

    event LockedAmountSet(uint256 indexed pid, address indexed user, uint256 amount);
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
        version = "9.0";

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

    /// @notice Put the pool into "shutdown": blocks NEW deposits; claims/withdraws continue so users can exit.
    function shutdownPool(uint256 pid) external onlyOwner {
        require(pid < poolInfo.length, "Invalid pool");
        if (!poolRemoved[pid]) {
            poolRemoved[pid] = true;
            emit PoolShutdown(pid);
        }
    }

    /**
     * @notice Soft-remove a pool after it is empty. No PID reindexing.
     * Deposits are already blocked by shutdown; we also clear the charity wallet as a defensive measure.
     * PATCH: flush legacy charity before clearing the wallet to avoid future reverts.
     * HARDENED: Set charity wallet to treasury instead of zero to prevent stranded rewards.
     */
    function removePool(uint256 pid) external onlyOwner {
        require(pid < poolInfo.length, "Invalid pool");
        require(poolInfo[pid].totalStaked == 0, "Pool not empty");

        // Flush any legacy-accrued charity to the current charity wallet BEFORE clearing it.
        uint256 charityToMint = _allocateAndPredebitCharity(pid);
        if (charityToMint > 0) {
            _mintCharityIfAny(pid, charityToMint); // requires charityWallet != 0
        }

        poolRemoved[pid] = true;
        // HARDENED: Set to treasury instead of zero, so future claims/rewards can be minted
        // This prevents reward loss if users claim after pool removal.
        address old = poolInfo[pid].charityWallet;
        poolInfo[pid].charityWallet = treasury;
        emit PoolRemoved(pid);
        emit CharityWalletUpdated(pid, old, treasury);
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

    /// @notice Migrate bootstrap position from one nonprofit address to another.
    ///         Preserves pending rewards by copying the amount and rewardDebt.
    ///         Does NOT mint to the old address.
    ///         Pool and global staking totals remain unchanged.
    ///
    /// HARDENED:
    ///  - Atomically updates charity wallet (prevents stranding)
    ///  - Validates that newNonprofit will be the new pool charity BEFORE migration
    ///  - Ensures no lost rewards through explicit debt copying
    ///
    /// Preconditions:
    ///  - oldNonprofit IS the pool's current charity wallet
    ///  - oldNonprofit != newNonprofit
    ///  - oldNonprofit has a non-zero stake (bootstrap) in this pool
    ///  - newNonprofit does not already have a stake in this pool
    function migrateBootstrap(
        uint256 pid,
        address oldNonprofit,
        address newNonprofit
    ) external onlyOwner nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(oldNonprofit != address(0), "oldNonprofit=0");
        require(newNonprofit != address(0), "newNonprofit=0");
        require(oldNonprofit != newNonprofit, "Same address");

        // HARDENED: Ensure old nonprofit is the pool's current charity wallet
        address currentCharity = poolInfo[pid].charityWallet;
        require(oldNonprofit == currentCharity, "oldNonprofit not pool charity");

        // HARDENED: Ensure new nonprofit doesn't already have a stake in this pool
        require(userAmount[pid][newNonprofit] == 0, "newNonprofit already staked");

        // Get the old nonprofit's stake and locked amount
        uint256 amtOld = userAmount[pid][oldNonprofit];
        require(amtOld > 0, "no bootstrap at old");

        uint256 debtOld = userRewardDebt[pid][oldNonprofit];
        uint256 lockOld = lockedAmount[pid][oldNonprofit];

        // Freeze pool accumulator so pending = amt*acc - debt stays consistent
        _accruePool(pid);

        // Deactivate old user's pool counters
        _afterWithdrawBalanceHooks(pid, oldNonprofit, 0);

        // Zero old mappings (NO MINT to old)
        userAmount[pid][oldNonprofit] = 0;
        userRewardDebt[pid][oldNonprofit] = 0;
        if (lockOld != 0) {
            lockedAmount[pid][oldNonprofit] = 0;
            emit LockedAmountSet(pid, oldNonprofit, 0);
        }

        // Push to new address
        uint256 balBeforeNew = userAmount[pid][newNonprofit];

        // If new had no stake in this pool, bump unique counters
        _accountUniqueStaker(pid, newNonprofit, balBeforeNew);
        _updateGlobalStakeOnNewPool(newNonprofit, balBeforeNew);

        // Transfer amount and debt (preserves pending = amt*acc - debt)
        // HARDENED: Explicit validation that debt preservation works
        uint256 pendingBefore = ((amtOld * accRewardPerShare[pid]) / 1e12) - debtOld;

        userAmount[pid][newNonprofit] = balBeforeNew + amtOld;
        userRewardDebt[pid][newNonprofit] = userRewardDebt[pid][newNonprofit] + debtOld;

        // HARDENED: Verify pending is preserved (allow 1 wei tolerance for rounding)
        uint256 pendingAfter = ((userAmount[pid][newNonprofit] * accRewardPerShare[pid]) / 1e12) - userRewardDebt[pid][newNonprofit];
        require(
            pendingAfter >= pendingBefore && pendingAfter <= pendingBefore + 1,
            "pending rewards not preserved"
        );

        if (lockOld != 0) {
            // HARDENED: Prevent lock overflow
            uint256 newLock = lockedAmount[pid][newNonprofit] + lockOld;
            require(newLock <= userAmount[pid][newNonprofit], "lock would exceed balance");
            lockedAmount[pid][newNonprofit] = newLock;
            emit LockedAmountSet(pid, newNonprofit, newLock);
        }

        // HARDENED: Update charity wallet ATOMICALLY as part of migration
        // This ensures the new nonprofit is registered as charity wallet at the same time
        // their bootstrap position is transferred. Prevents stranding.
        poolInfo[pid].charityWallet = newNonprofit;

        // Invariants: poolInfo[pid].totalStaked and globalTotalStaked unchanged
        emit CharityWalletUpdated(pid, oldNonprofit, newNonprofit);
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
    /// New behavior: credit 100% (gross) to the accumulator; no new pool-level charity accrual.
    function _accruePool(uint256 pid) internal returns (uint256 sCut, uint256 tCut, uint256 fCut) {
        PoolInfo memory p = poolInfo[pid];

        uint256 last = lastRewardTime[pid];
        uint256 nowTs = block.timestamp;
        if (nowTs <= last) return (0, 0, 0);

        if (p.totalStaked == 0) {
            lastRewardTime[pid] = nowTs;
            return (0, 0, 0);
        }

        uint256 rewardGross = _sumRewardAcrossPhases(last, nowTs, p.totalStaked);
        if (rewardGross == 0) {
            lastRewardTime[pid] = nowTs;
            return (0, 0, 0);
        }

        // Accrue GROSS reward to accRewardPerShare
        accRewardPerShare[pid] += Math.mulDiv(rewardGross, 1e12, p.totalStaked);

        // No new pool-level accruals for charity/treasury/fund in this version.
        sCut = 0;
        tCut = 0;
        fCut = 0;

        lastRewardTime[pid] = nowTs;
    }

    // =========================
    // Policy: charity self-stake freeze (bootstrap-only)
    // =========================

    function _isPoolCharity(uint256 pid, address addr) internal view returns (bool) {
        return addr == poolInfo[pid].charityWallet;
    }

    /**
     * @dev Enforces that a pool's charity wallet may receive exactly ONE permanent, locked
     * bootstrap deposit from charityFund (when its balance is 0). Any other self-stake is disallowed.
     * Existing locked stake remains claimable (not withdrawable) unless admin force exits.
     */
    function _enforceCharitySelfStakePolicy(
        uint256 pid,
        address beneficiary,
        bool lockThisDeposit
    ) internal view {
        if (!_isPoolCharity(pid, beneficiary)) return;

        uint256 curr = userAmount[pid][beneficiary];
        bool firstBootstrap = (
            msg.sender == charityFund &&
            lockThisDeposit == true &&
            curr == 0
        );

        require(firstBootstrap, "charity self-stake disabled");
    }

    // =========================
    // User actions — CEI with per-claim 88/10/1/1 split
    // =========================

    function deposit(uint256 pid, uint256 amount) external nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(!poolRemoved[pid], "Pool shutdown");
        _enforceCharitySelfStakePolicy(pid, msg.sender, false);
        _depositCore(pid, amount, msg.sender, false);
    }

    function depositFor(uint256 pid, uint256 amount, address beneficiary)
        external
        nonReentrant
    {
        require(pid < poolInfo.length, "Invalid pool");
        require(!poolRemoved[pid], "Pool shutdown");
        _enforceCharitySelfStakePolicy(pid, beneficiary, false);
        _depositCore(pid, amount, beneficiary, false);
    }

    function depositWithPermit(
        uint256 pid,
        uint256 amount,
        address beneficiary,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(!poolRemoved[pid], "Pool shutdown");
        _enforceCharitySelfStakePolicy(pid, beneficiary, false);
        _depositCorePermit(pid, amount, beneficiary, false, deadline, v, r, s);
    }

    /// Only the charityFund is allowed to create permanently locked deposits (used for bootstrap).
    function depositForWithLock(
        uint256 pid,
        uint256 amount,
        address beneficiary
    ) external nonReentrant {
        require(msg.sender == charityFund, "Only charityFund");
        require(pid < poolInfo.length, "Invalid pool");
        require(!poolRemoved[pid], "Pool shutdown");
        require(_isPoolCharity(pid, beneficiary), "not pool charity"); // NEW guard
        _enforceCharitySelfStakePolicy(pid, beneficiary, true);
        _depositCore(pid, amount, beneficiary, true);
    }

    function charityFundBootstrap(uint256 pid, uint256 amount, address beneficiary)
        external
        nonReentrant
    {
        require(msg.sender == charityFund, "Only charityFund");
        require(pid < poolInfo.length, "Invalid pool");
        require(!poolRemoved[pid], "Pool shutdown");
        require(_isPoolCharity(pid, beneficiary), "not pool charity"); // NEW guard
        _enforceCharitySelfStakePolicy(pid, beneficiary, true);
        _depositCore(pid, amount, beneficiary, true);
    }

    // ---------- Internal helpers ----------

    struct DepCalcs {
        uint256 acc;
        uint256 balBefore;
        uint256 debtBefore;
        uint256 pending; // GROSS
        uint256 tCut;    // unused
        uint256 fCut;    // unused
    }

    function _accrueAndComputePending(uint256 pid, address user) internal returns (DepCalcs memory d) {
        ( , d.tCut, d.fCut) = _accruePool(pid); // returns zeros now
        d.acc        = accRewardPerShare[pid];
        d.balBefore  = userAmount[pid][user];
        d.debtBefore = userRewardDebt[pid][user];
        d.pending    = ((d.balBefore * d.acc) / 1e12) - d.debtBefore; // GROSS pending
    }

    function _accountUniqueStaker(uint256 pid, address user, uint256 balBefore) internal {
        if (balBefore == 0 && !_isActiveStaker[pid][user]) {
            _isActiveStaker[pid][user] = true;
            uniqueStakersByPool[pid] += 1;
        }
    }

    function _bumpBalancesOnDeposit(uint256 pid, address user, uint256 amount, uint256 acc, uint256 balBefore) internal {
        userAmount[pid][user]      = balBefore + amount;
        poolInfo[pid].totalStaked  += amount;
        globalTotalStaked          += amount;
        totalDepositedByUser[user] += amount;
        totalDepositedByPool[pid]  += amount;
        userRewardDebt[pid][user]   = ((balBefore + amount) * acc) / 1e12;
    }

    function _updateGlobalStakeOnNewPool(address user, uint256 balBefore) internal {
        if (balBefore == 0) {
            uint256 prev = activePoolCount[user];
            activePoolCount[user] = prev + 1;
            if (prev == 0) {
                stakedSince[user] = uint64(block.timestamp);
                uniqueStakersGlobal += 1;
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
        // legacy flush (no longer accrues new amounts)
        charityToMint = charityAccrued[pid];
        if (charityToMint > 0) {
            charityAccrued[pid] = 0;
            totalCharityMintedByPool[pid] += charityToMint;
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

    /// Split a user's GROSS pending as 88/10/1/1 and record user's claimed amount.
    /// CEI fix: update internal state BEFORE any external mints.
    function _mintSlices(
        address to,
        uint256 pendingGross,
        uint256 /*unused_tCut*/,
        uint256 /*unused_fCut*/,
        uint256 pid
    ) internal {
        if (pendingGross == 0) return;

        // Compute splits from GROSS pending
        uint256 userShare = Math.mulDiv(pendingGross, STAKER_BPS, TOTAL_BPS);       // 88%
        uint256 charity   = Math.mulDiv(pendingGross, CHARITY_BPS, TOTAL_BPS);      // 10%
        uint256 tShare    = Math.mulDiv(pendingGross, TREASURY_BPS, TOTAL_BPS);     // 1%
        uint256 fShare    = Math.mulDiv(pendingGross, CHARITY_FUND_BPS, TOTAL_BPS); // 1%

        // ---- EFFECTS (no external calls) ----
        if (userShare > 0) {
            totalClaimedByUser[to] += userShare;
        }

        // ---- INTERACTIONS (external calls) ----
        if (userShare > 0) {
            stakingToken.mint(to, userShare);
            emit Claim(to, pid, userShare);
        }

        address cw = poolInfo[pid].charityWallet;
        if (charity > 0) {
            require(cw != address(0), "charity=0");
            stakingToken.mint(cw, charity);
            emit CharityDistributed(pid, charity);
        }
        if (tShare > 0) {
            stakingToken.mint(treasury, tShare);
            emit TreasuryDistributed(tShare);
        }
        if (fShare > 0) {
            stakingToken.mint(charityFund, fShare);
            emit CharityFundDistributed(fShare);
        }
    }

    // --- Core deposit without permit (thin wrapper) ---
    function _depositCore(uint256 pid, uint256 amount, address beneficiary, bool lockThisDeposit) internal {
        require(amount > 0, "Cannot stake 0");
        require(pid < poolInfo.length, "Invalid pool");
        require(!poolRemoved[pid], "Pool shutdown");
        require(beneficiary != address(0), "beneficiary=0");

        DepCalcs memory d = _accrueAndComputePending(pid, beneficiary);

        _accountUniqueStaker(pid, beneficiary, d.balBefore);
        _bumpBalancesOnDeposit(pid, beneficiary, amount, d.acc, d.balBefore);
        _updateGlobalStakeOnNewPool(beneficiary, d.balBefore);
        _applyLockIfNeeded(pid, beneficiary, amount, lockThisDeposit);

        uint256 charityToMint = _allocateAndPredebitCharity(pid);

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
        require(!poolRemoved[pid], "Pool shutdown");
        require(beneficiary != address(0), "beneficiary=0");

        DepCalcs memory d = _accrueAndComputePending(pid, beneficiary);

        _accountUniqueStaker(pid, beneficiary, d.balBefore);
        _bumpBalancesOnDeposit(pid, beneficiary, amount, d.acc, d.balBefore);
        _updateGlobalStakeOnNewPool(beneficiary, d.balBefore);
        _applyLockIfNeeded(pid, beneficiary, amount, lockThisDeposit);

        uint256 charityToMint = _allocateAndPredebitCharity(pid);

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
        uint256 pending; // GROSS
        uint256 newBal;
        uint256 tCut; // unused
        uint256 fCut; // unused
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
                    uniqueStakersGlobal -= 1;
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
        w.pending = ((w.userBal * w.acc) / 1e12) - w.debt; // GROSS

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
        uint256 pending; // GROSS
        uint256 tCut; // unused
        uint256 fCut; // unused
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
        c.pending = ((c.bal * c.acc) / 1e12) - c.debt; // GROSS

        // EFFECTS
        userRewardDebt[pid][user] = (c.bal * c.acc) / 1e12;

        c.charityToMint = _allocateAndPredebitCharity(pid);

        // INTERACTIONS
        _mintCharityIfAny(pid, c.charityToMint);
        _mintSlices(user, c.pending, c.tCut, c.fCut, pid);
    }

    // =========================
    // Admin emergency: force exit a single user (ignores locks)
    // =========================

    /**
     * @notice Convenience function that returns principal to the user itself (no separate recipient).
     *         Used for governance pool removal when users get their principal back directly.
     * @param pid Pool id
     * @param user Address to exit
     * @param claimRewards If true, mints their pending rewards before exiting
     */
    function forceExitUserToSelf(
        uint256 pid,
        address user,
        bool claimRewards
    ) external onlyOwner nonReentrant {
        require(pid < poolInfo.length, "Invalid pool");
        require(user != address(0), "user=0");

        // Accrue pool first
        _accruePool(pid);

        uint256 acc = accRewardPerShare[pid];
        uint256 bal = userAmount[pid][user];
        if (bal == 0) {
            return; // nothing to do
        }

        uint256 debt = userRewardDebt[pid][user];
        uint256 pending = ((bal * acc) / 1e12) - debt; // GROSS pending

        // EFFECTS: zero the user
        userAmount[pid][user] = 0;
        poolInfo[pid].totalStaked -= bal;
        globalTotalStaked -= bal;
        totalWithdrawnByUser[user] += bal;
        totalWithdrawnByPool[pid]  += bal;

        // Reset active counters
        _afterWithdrawBalanceHooks(pid, user, 0);

        // Reset reward debt and clear lock
        userRewardDebt[pid][user] = 0;
        if (lockedAmount[pid][user] != 0) {
            lockedAmount[pid][user] = 0;
            emit LockedAmountSet(pid, user, 0);
        }

        uint256 charityToMint = _allocateAndPredebitCharity(pid);

        // INTERACTIONS
        _mintCharityIfAny(pid, charityToMint);

        // Return principal to user
        stakingToken.safeTransfer(user, bal);

        // Optionally mint pending rewards
        if (claimRewards && pending > 0) {
            _mintSlices(user, pending, 0, 0, pid);
        }

        emit Withdraw(user, pid, bal);
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

    /// @notice Returns the user's GROSS pending amount.
    function pendingRewards(uint256 pid, address userAddr) external view returns (uint256) {
        PoolInfo memory p = poolInfo[pid];
        uint256 acc = accRewardPerShare[pid];
        uint256 last = lastRewardTime[pid];

        if (block.timestamp > last && p.totalStaked != 0) {
            uint256 rewardGross = _sumRewardAcrossPhases(last, block.timestamp, p.totalStaked);
            if (rewardGross > 0) {
                acc += Math.mulDiv(rewardGross, 1e12, p.totalStaked); // accrue GROSS
            }
        }

        uint256 bal = userAmount[pid][userAddr];
        uint256 debt = userRewardDebt[pid][userAddr];
        return ((bal * acc) / 1e12) - debt; // GROSS
    }

    function getPoolAPR(uint256 pid) external view returns (uint256 aprBps) {
        PoolInfo memory p = poolInfo[pid];
        if (p.totalStaked == 0) return 0;

        uint256 start = block.timestamp;
        uint256 end   = start + 365 days;

        uint256 yearlyPoolGross = _sumRewardAcrossPhases(start, end, p.totalStaked);
        if (yearlyPoolGross == 0) return 0;

        // Return APR for the user portion (88%)
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

    /// @notice Legacy helper: returns only already-accrued legacy charity (no new accrual).
    function pendingCharityFor(uint256 pid) external view returns (uint256) {
        if (pid >= poolInfo.length) return 0;
        return charityAccrued[pid];
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
        uniqueStakers_  = uniqueStakersGlobal;
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
            uint256 pending, // GROSS
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
            uint256 rewardGross = _sumRewardAcrossPhases(last, block.timestamp, p.totalStaked);
            if (rewardGross > 0) {
                acc += Math.mulDiv(rewardGross, 1e12, p.totalStaked); // accrue GROSS
            }
        }

        pending = ((staked * acc) / 1e12) - rewardDebt; // GROSS
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

    /// Total staking seconds including current session if active
    function stakeElapsed(address user) external view returns (uint256) {
        uint256 cum = cumulativeStakeSeconds[user];
        uint64 since = stakedSince[user];
        if (since != 0) {
            cum += block.timestamp - uint256(since);
        }
        return cum;
    }

    // ---- storage gap for future upgrades ----
    uint256[99] private __gap; // reduced by 1 to append poolRemoved
}
