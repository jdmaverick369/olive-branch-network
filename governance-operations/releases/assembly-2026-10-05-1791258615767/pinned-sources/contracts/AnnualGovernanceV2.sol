// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OliveAssembly} from "./OliveAssembly.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IStakingPoolsForGovernance {
    function poolLength() external view returns (uint256);
    function getPoolInfo(uint256 pid) external view returns (address charityWallet, uint256 totalStaked);
    function poolFullyRemoved(uint256 pid) external view returns (bool);
    function getPastVotingPower(address user, uint256 blockNumber) external view returns (uint256);
    function checkpointCount(address user) external view returns (uint256);
    function bootstrapCheckpoint(address user) external;
    function totalStakedByUser(address user) external view returns (uint256);
    function userAmount(uint256 pid, address user) external view returns (uint256);
}

interface ITheOffering {
    function burn(uint256 amount) external;
    function sendToExtend(uint256 amount) external;
}

interface IExtendOliveBranch {
    function distributeFromGovernance(address nonprofit, uint256 amount) external;
    function approvedNonprofit(address nonprofit) external view returns (bool);
}

/// @title AnnualGovernanceV2
/// @dev NFT registration gates new cycles; weight is sqrt(stake), expressed in 18-decimal units.
/// @notice Two-phase annual governance for Olive Branch Network. UUPS upgradeable behind Timelock.
///
/// Phase 1 (Burn/Give): stakers vote whether TheOffering's accumulated OBN balance is
///   burned or sent to ExtendOliveBranch. BURN wins unless GIVE strictly exceeds BURN.
///   Zero participation → BURN.
///
/// Phase 2 (Nonprofit): stakers vote which approved nonprofit receives ExtendOliveBranch's
///   OBN balance captured at Phase 1 start, plus that cycle's GIVE transfer if selected.
///   Later receipts stay for the next cycle. Zero participation → rollover (funds stay for next cycle).
///   Tie → first in ballot (lowest index) wins.
///
/// Both phases share a single voting-power snapshot taken at cycle start. Phase 2 always runs after
/// Phase 1 regardless of the Phase 1 outcome.
///
/// Roles:
///   owner (Timelock) — set at initialization. Admin: cancel cycles, set voteAdmin,
///                      set maxBallotSize, authorize upgrades.
///   voteAdmin        — mutable. Calls startAnnualCycle(). Typically a Gnosis Safe.
///
/// Ballot eligibility: pools where poolFullyRemoved == false (active + shutdown-but-not-removed).
///   Duplicate charity wallets across pools are deduplicated. startAnnualCycle() reverts if
///   any ballot address is not approved in ExtendOliveBranch (Option 3 whitelist check).
///
/// Cancel window: cancelCycle() is available until phase1Executed. Once TheOffering has
///   been called, the cycle must run to completion (Phase 2 is a no-op if needed).
///
/// Phase 2 timing: phase2End is set when executePhase1() is called, not at cycle start.
///   phase2End = block.timestamp + phase2Duration. Phase 2 always receives its full
///   phase2Duration regardless of how late Phase 1 is executed.
///
/// Upgrade safety: do not upgrade while a cycle is in PHASE1_OPEN, PHASE1_READY,
///   PHASE2_OPEN, or PHASE2_READY state. _authorizeUpgrade enforces this on-chain;
///   the Timelock's 24h delay provides a second layer.
contract AnnualGovernanceV2 is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    // ─── Enums ──────────────────────────────────────────────────────────────────

    enum Phase1Outcome { PENDING, BURN, GIVE }

    enum CycleState {
        INACTIVE,       // cycleId does not exist
        PHASE1_OPEN,    // voting open, block.timestamp < phase1End
        PHASE1_READY,   // block.timestamp >= phase1End, executePhase1() callable
        PHASE2_OPEN,    // phase1 executed, block.timestamp < phase2End
        PHASE2_READY,   // block.timestamp >= phase2End, executePhase2() callable
        COMPLETED,      // both phases executed
        CANCELLED       // cancelled by owner before phase1Executed
    }

    // ─── Cycle struct ────────────────────────────────────────────────────────────
    //
    // Solidity allows mappings in structs stored inside a mapping (storage only).
    // All access to Cycle fields must be via storage references — never copied to memory.
    //
    // UPGRADE SAFETY — treat this struct layout as frozen:
    //   - Never reorder, remove, or change the type of any field.
    //   - New fields may only be appended at the end.
    //   - Nested mapping declarations (onBallot, nonprofitVotes, votedPhase1, votedPhase2)
    //     must not be reordered or removed; their slot derivations are keyed off position
    //     within the struct and will silently corrupt live cycle data if changed.

    struct Cycle {
        // Timing
        uint48 snapshotBlock;
        uint64 phase1End;
        uint64 phase2Duration; // stored at startAnnualCycle; used by executePhase1 to set phase2End
        uint64 phase2End;      // set by executePhase1(); 0 until then

        // Phase 1 tally
        uint256       burnVotes;
        uint256       giveVotes;
        Phase1Outcome phase1Outcome;  // set by executePhase1

        // Phase 2 ballot and tally
        address[]                   ballot;
        mapping(address => bool)    onBallot;       // O(1) membership check
        mapping(address => uint256) nonprofitVotes;

        // Double-vote prevention
        mapping(address => bool) votedPhase1;
        mapping(address => bool) votedPhase2;

        // Execution flags
        bool phase1Executed;
        bool phase2Executed;
        bool cancelled;

        // Appended for the fixed-allocation upgrade. Existing Cycle fields stay in place.
        uint256 phase2Allocation;
        // Distinguishes a legitimate zero allocation from historical, pre-upgrade cycles.
        bool phase2AllocationFixed;

        // Append-only: balances captured when Phase 1 opens. Zero is a valid allocation.
        uint256 offeringAllocation;
        uint256 extendAllocationAtStart;
        bool fundsFixedAtStart;
        // Append-only analytics. Legacy cycles explicitly report recorded=false.
        uint256 registeredAtSnapshot;
        uint256 phase1Voters;
        uint256 phase2Voters;
        uint256 phase2VotingPower;
        address settledWinner;
        uint256 settledAmount;
        bool analyticsRecorded;
        uint256 preparationPoolCount;
        uint256 preparationCursor;
        bool ballotComplete;
        bool incrementalBallot;
        address leadingNonprofit;
        mapping(address => uint256) ballotPosition; // one-based, preserves PID tie order
    }

    // ─── Storage ─────────────────────────────────────────────────────────────────
    //
    // OZ v5 OwnableUpgradeable and UUPSUpgradeable use ERC7201 namespaced storage
    // and do not occupy linear slots. Custom state starts at slot 0.
    //
    // Slot 0: obn
    // Slot 1: stakingPools
    // Slot 2: theOffering
    // Slot 3: extendOliveBranch
    // Slot 4: voteAdmin
    // Slot 5: maxBallotSize
    // Slot 6: currentCycleId
    // Slot 7: _cycles
    // Slot 8: nftVault; slot 9: firstNFTCycleId; slot 10: indexedPoolCount;
    // slot 11: _indexedPools; slots 12-57: __gap

    IERC20                     public obn;               // slot 0
    IStakingPoolsForGovernance public stakingPools;      // slot 1
    ITheOffering               public theOffering;       // slot 2
    IExtendOliveBranch         public extendOliveBranch; // slot 3

    address public voteAdmin;      // slot 4
    uint256 public maxBallotSize;  // slot 5
    uint256 public currentCycleId; // slot 6  (0 = no cycles started)

    mapping(uint256 => Cycle) private _cycles; // slot 7

    // UPGRADE SAFETY: when adding new state variables in a future upgrade, append them
    // immediately before __gap and reduce __gap by the number of slots consumed.
    // Example: adding one address (1 slot) changes __gap[50] → __gap[49].
    // Never leave __gap unchanged after adding variables.
    // Slots 8-9 consumed by NFT governance; original slots 0-7 and existing Cycle fields are unchanged.
    OliveAssembly public nftVault;
    uint256 public firstNFTCycleId;
    uint256 public indexedPoolCount; // slot 10: monotonic historical scan cursor
    uint256[] private _indexedPools; // slot 11: ascending, not fully removed pool IDs
    uint256[46] private __gap; // slots 12-57
    uint256 public constant MIN_VOTING_STAKE = 1 ether; // 1 OBN, with 18 decimals
    uint256 public constant MAX_PHASE_DURATION = 30 days;
    uint256 public constant MAX_INDEX_BATCH = 100;
    event BallotBatchPrepared(uint256 indexed cycleId, uint256 cursor, uint256 poolCount, address[] added);
    event BallotPreparationCompleted(uint256 indexed cycleId, uint256 ballotSize);

    event PoolIndexSynced(uint256 indexedPools, uint256 activePools);

    event NFTVotingInitialized(address indexed vault, uint256 firstCycleId);
    event CycleFundsSnapshotted(uint256 indexed cycleId, uint256 offeringAllocation, uint256 extendAllocation);
    /// @notice Must be called atomically with the upgrade by the existing Timelock owner.
    /// Old cycles retain their original linear power; only future cycles use the new rules.
    function initializeNFTVoting(address vault) external reinitializer(2) onlyOwner {
        _authorizeUpgrade(address(0)); // also enforces no active cycle
        require(vault.code.length > 0, "vault has no code");
        require(address(OliveAssembly(vault).oliveNFT()).code.length > 0, "invalid NFT");
        require(OliveAssembly(vault).owner() == owner(), "vault owner mismatch");
        nftVault = OliveAssembly(vault);
        firstNFTCycleId = currentCycleId + 1;
        emit NFTVotingInitialized(vault, firstNFTCycleId);
    }

    function usesNFTVoting(uint256 cycleId) public view returns (bool) {
        return firstNFTCycleId != 0 && cycleId >= firstNFTCycleId;
    }

    function isNFTEligibleForCycle(uint256 cycleId, address user) public view returns (bool) {
        if (cycleId == 0 || cycleId > currentCycleId) return false;
        if (!usesNFTVoting(cycleId)) return true;
        return nftVault.getPastRegistration(user, _cycles[cycleId].snapshotBlock) != 0;
    }

    /// @notice Zero below 1 OBN aggregate stake; otherwise 18-decimal square-root voting units.
    /// Square-root precision is 9 decimals. This threshold applies only to NFT voting cycles.
    /// Input is 18-decimal OBN stake. sqrt(100e18) * 1e9 = 10e18.
    /// Taking sqrt before scaling avoids overflow even for uint256-max input.
    function squareRootVotingPower(uint256 stake) public pure returns (uint256) {
        if (stake < MIN_VOTING_STAKE) return 0;
        return Math.sqrt(stake) * 1e9;
    }

    function _powerForCycle(uint256 cycleId, address user) private view returns (uint256) {
        uint256 stake = stakingPools.getPastVotingPower(user, _cycles[cycleId].snapshotBlock);
        if (!usesNFTVoting(cycleId)) return stake;
        if (!isNFTEligibleForCycle(cycleId, user)) return 0;
        return squareRootVotingPower(stake);
    }

    // ─── Events ──────────────────────────────────────────────────────────────────

    event CycleStarted(
        uint256 indexed cycleId,
        uint256         snapshotBlock,
        uint64          phase1End,
        uint64          phase2Duration,
        address[]       ballot
    );
    event OfferingVoteCast(
        uint256 indexed cycleId,
        address indexed voter,
        bool            burn,
        uint256         votingPower
    );
    event NonprofitVoteCast(
        uint256 indexed cycleId,
        address indexed voter,
        address indexed nonprofit,
        uint256         votingPower
    );
    event Phase1Executed(uint256 indexed cycleId, Phase1Outcome outcome, uint256 amount, uint64 phase2End);
    event Phase2AllocationFixed(uint256 indexed cycleId, uint256 amount);
    event Phase2Started(uint256 indexed cycleId, uint64 phase2End);
    event Phase2Executed(uint256 indexed cycleId, address indexed winner, uint256 amount);
    event Phase2RolledOver(uint256 indexed cycleId);
    event CycleCancelled(uint256 indexed cycleId, address indexed cancelledBy);
    event VoteAdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event MaxBallotSizeUpdated(uint256 oldSize, uint256 newSize);

    // ─── Modifiers ───────────────────────────────────────────────────────────────


    // ─── Constructor / initializer ────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address obn_,
        address stakingPools_,
        address theOffering_,
        address extendOliveBranch_,
        address timelockOwner_,
        address voteAdmin_,
        uint256 maxBallotSize_
    ) external initializer {
        require(obn_               != address(0), "obn=0");
        require(stakingPools_      != address(0), "stakingPools=0");
        require(theOffering_       != address(0), "theOffering=0");
        require(extendOliveBranch_ != address(0), "extendOliveBranch=0");
        require(timelockOwner_     != address(0), "timelockOwner=0");
        require(voteAdmin_         != address(0), "voteAdmin=0");
        require(maxBallotSize_     > 0,           "maxBallotSize=0");

        __Ownable_init(timelockOwner_);
        __UUPSUpgradeable_init();

        obn               = IERC20(obn_);
        stakingPools      = IStakingPoolsForGovernance(stakingPools_);
        theOffering       = ITheOffering(theOffering_);
        extendOliveBranch = IExtendOliveBranch(extendOliveBranch_);
        voteAdmin         = voteAdmin_;
        maxBallotSize     = maxBallotSize_;
    }

    // ─── Upgrade authorization ────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal view override onlyOwner {
        if (currentCycleId > 0) {
            CycleState s = getCycleState(currentCycleId);
            require(
                s == CycleState.COMPLETED ||
                s == CycleState.CANCELLED ||
                s == CycleState.INACTIVE,
                "upgrade: cycle in progress"
            );
        }
    }

    // ─── Cycle start (voteAdmin) ─────────────────────────────────────────────────

    modifier onlyVoteAdmin() {
        require(msg.sender == voteAdmin, "not voteAdmin");
        _;
    }

    /// @notice The voteAdmin Safe opens Phase 1 directly, without a Timelock delay.
    ///         Retains the legacy function name. Builds the ballot from active pools, validates
    ///         the ExtendOliveBranch whitelist, and takes a voting power snapshot.
    /// @param phase1Duration Must be exactly 30 days (2592000 seconds).
    /// @param phase2Duration Must be exactly 30 days (2592000 seconds).
    function startAnnualCycle(uint64 phase1Duration, uint64 phase2Duration) external onlyVoteAdmin {
        require(address(nftVault) != address(0), "NFT voting not initialized");
        require(address(nftVault.governance()) == address(this), "vault not bound");
        require(nftVault.getPastRegisteredCount(block.number - 1) > 0, "no registrations at snapshot");
        require(phase1Duration == MAX_PHASE_DURATION, "phase1 must be 30 days");
        require(phase2Duration == MAX_PHASE_DURATION, "phase2 must be 30 days");

        if (currentCycleId > 0) {
            CycleState prev = getCycleState(currentCycleId);
            require(
                prev == CycleState.COMPLETED || prev == CycleState.CANCELLED,
                "previous cycle not complete"
            );
        }

        uint256 cycleId = ++currentCycleId;
        Cycle storage c = _cycles[cycleId];
        c.preparationPoolCount = stakingPools.poolLength();
        require(c.preparationPoolCount > 0, "empty pool history");
        c.incrementalBallot = true;
        // Snapshot one block before cycle start so any stake deposited in the same
        // block as startAnnualCycle cannot be counted toward voting power.
        uint48 snap      = uint48(block.number - 1);
        c.snapshotBlock  = snap;
        c.phase1End      = uint64(block.timestamp) + phase1Duration;
        c.phase2Duration = phase2Duration;
        // Monetary cutoff is this transaction, not the previous-block voter snapshot.
        // All subsequent receipts remain for the next cycle, except this cycle's GIVE.
        c.offeringAllocation = obn.balanceOf(address(theOffering));
        c.extendAllocationAtStart = obn.balanceOf(address(extendOliveBranch));
        c.fundsFixedAtStart = true;
        c.registeredAtSnapshot = nftVault.getPastRegisteredCount(snap);
        c.analyticsRecorded = true;
        emit CycleFundsSnapshotted(cycleId, c.offeringAllocation, c.extendAllocationAtStart);
        // phase2End is intentionally not set here; it is set in executePhase1() so
        // Phase 2 always receives its full duration regardless of when Phase 1 is executed.

        _prepareBallot(cycleId, MAX_INDEX_BATCH);
        // For large cycles this legacy event contains only the initial batch.
        // BallotBatchPrepared and paginated reads expose the complete ballot.
        emit CycleStarted(cycleId, snap, c.phase1End, phase2Duration, c.ballot);
    }

    // ─── Voting ──────────────────────────────────────────────────────────────────

    /// @notice Cast a Phase 1 vote. `burn = true` votes to burn TheOffering's balance;
    ///         `burn = false` votes to send it to ExtendOliveBranch.
    function castOfferingVote(uint256 cycleId, bool burn) external {
        require(getCycleState(cycleId) == CycleState.PHASE1_OPEN, "phase1 not open");

        Cycle storage c = _cycles[cycleId];
        require(!c.votedPhase1[msg.sender], "already voted phase1");
        c.votedPhase1[msg.sender] = true;

        // Auto-bootstrap pre-upgrade stakers who have not yet interacted post-upgrade.
        // bootstrapCheckpoint is permissionless and idempotent; try/catch is safe because
        // a failed bootstrap (e.g. no stake) is caught by the require(power > 0) below.
        if (stakingPools.checkpointCount(msg.sender) == 0) {
            try stakingPools.bootstrapCheckpoint(msg.sender) {} catch {}
        }

        require(isNFTEligibleForCycle(cycleId, msg.sender), "NFT not registered at snapshot");
        uint256 power = _powerForCycle(cycleId, msg.sender);
        require(power > 0, "no voting power at snapshot");

        c.phase1Voters++;
        if (burn) {
            c.burnVotes += power;
        } else {
            c.giveVotes += power;
        }

        emit OfferingVoteCast(cycleId, msg.sender, burn, power);
    }

    /// @notice Cast a Phase 2 vote for a specific nonprofit on the ballot.
    function castNonprofitVote(uint256 cycleId, address nonprofit) external {
        require(getCycleState(cycleId) == CycleState.PHASE2_OPEN, "phase2 not open");

        Cycle storage c = _cycles[cycleId];
        require(!c.votedPhase2[msg.sender], "already voted phase2");
        require(c.onBallot[nonprofit],       "not on ballot");
        c.votedPhase2[msg.sender] = true;

        // Auto-bootstrap pre-upgrade stakers who have not yet interacted post-upgrade.
        if (stakingPools.checkpointCount(msg.sender) == 0) {
            try stakingPools.bootstrapCheckpoint(msg.sender) {} catch {}
        }

        require(isNFTEligibleForCycle(cycleId, msg.sender), "NFT not registered at snapshot");
        uint256 power = _powerForCycle(cycleId, msg.sender);
        require(power > 0, "no voting power at snapshot");

        c.nonprofitVotes[nonprofit] += power;
        c.phase2Voters++;
        c.phase2VotingPower += power;
        address leader = c.leadingNonprofit;
        if (leader == address(0) || c.nonprofitVotes[nonprofit] > c.nonprofitVotes[leader]
            || (c.nonprofitVotes[nonprofit] == c.nonprofitVotes[leader]
                && c.ballotPosition[nonprofit] < c.ballotPosition[leader])) {
            c.leadingNonprofit = nonprofit;
        }

        emit NonprofitVoteCast(cycleId, msg.sender, nonprofit, power);
    }

    // ─── Execution (permissionless) ──────────────────────────────────────────────

    /// @notice Execute Phase 1. Callable by anyone after phase1End.
    ///         The existing keeper can execute the result and open Phase 2 without another Timelock operation.
    ///         BURN wins unless GIVE strictly exceeds BURN. Zero participation → BURN.
    ///         Burns or sends only TheOffering's balance captured at Phase 1 start.
    function executePhase1(uint256 cycleId) public {
        require(getCycleState(cycleId) == CycleState.PHASE1_READY, "not ready for phase1 execution");

        Cycle storage c = _cycles[cycleId];
        require(!c.incrementalBallot || c.ballotComplete, "ballot preparation incomplete");
        c.phase1Executed = true;
        c.phase1Outcome  = c.giveVotes > c.burnVotes ? Phase1Outcome.GIVE : Phase1Outcome.BURN;
        // Phase 2 gets its full duration starting from now, not from cycle start.
        c.phase2End      = uint64(block.timestamp) + c.phase2Duration;

        require(c.fundsFixedAtStart, "cycle funds not fixed");
        uint256 bal = c.offeringAllocation;
        if (bal > 0) {
            require(obn.balanceOf(address(theOffering)) >= bal, "phase1 allocation underfunded");
            if (c.phase1Outcome == Phase1Outcome.GIVE) {
                theOffering.sendToExtend(bal);
            } else {
                theOffering.burn(bal);
            }
        }

        // Finalize from the start-of-Phase-1 allocations, never the live balance.
        // GIVE reallocates this cycle's Offering funds; later receipts stay excluded.
        c.phase2Allocation = c.extendAllocationAtStart
            + (c.phase1Outcome == Phase1Outcome.GIVE ? bal : 0);
        c.phase2AllocationFixed = true;
        emit Phase2AllocationFixed(cycleId, c.phase2Allocation);

        emit Phase1Executed(cycleId, c.phase1Outcome, bal, c.phase2End);
        emit Phase2Started(cycleId, c.phase2End);
    }

    /// @notice Execute Phase 2. Callable by anyone after phase2End and after phase1 is executed.
    ///         Pays only the fixed allocation; subsequent receipts remain for the next cycle.
    ///         If an administrative withdrawal causes a shortfall, replenish before retrying.
    ///         Winner is the nonprofit with the most votes; ties go to the lowest ballot index.
    ///         Zero participation → rollover (ExtendOliveBranch balance stays for next cycle).
    function executePhase2(uint256 cycleId) public {
        require(getCycleState(cycleId) == CycleState.PHASE2_READY, "not ready for phase2 execution");

        Cycle storage c  = _cycles[cycleId];
        c.phase2Executed = true;

        address winner = c.leadingNonprofit;
        uint256 maxVotes = c.nonprofitVotes[winner];
        // No active legacy cycle can be upgraded. Historical cycles remain readable.
        require(c.incrementalBallot, "legacy cycle cannot settle");

        if (maxVotes == 0) {
            emit Phase2RolledOver(cycleId);
        } else {
            // No live-balance fallback: zero is a valid fixed allocation. Upgrades are
            // forbidden mid-cycle, so every executable cycle must have this snapshot.
            require(c.phase2AllocationFixed, "phase2 allocation not fixed");
            uint256 bal = c.phase2Allocation;
            c.settledWinner = winner;
            c.settledAmount = bal;
            if (bal > 0) {
                require(obn.balanceOf(address(extendOliveBranch)) >= bal, "phase2 allocation underfunded");
                extendOliveBranch.distributeFromGovernance(winner, bal);
            }
            emit Phase2Executed(cycleId, winner, bal);
        }
    }

    /// @notice Permissionless dispatcher for the existing keeper: execute Phase 1/open Phase 2,
    ///         or settle Phase 2, once the corresponding deadline has passed.
    ///         Detects whether currentCycleId is PHASE1_READY or PHASE2_READY and calls the
    ///         appropriate execute function. Reverts if no cycle exists or the cycle is not
    ///         in a ready-to-execute state.
    ///
    ///         Always operates on currentCycleId. There is no multi-cycle backlog: the contract
    ///         enforces that a new cycle cannot start until the previous one is COMPLETED or
    ///         CANCELLED, so at most one cycle can ever be pending execution at a time.
    function executeCurrentCycle() external {
        require(currentCycleId > 0, "no active cycle");
        CycleState state = getCycleState(currentCycleId);
        if ((state == CycleState.PHASE1_OPEN || state == CycleState.PHASE1_READY)
            && _cycles[currentCycleId].incrementalBallot && !_cycles[currentCycleId].ballotComplete) {
            _prepareBallot(currentCycleId, MAX_INDEX_BATCH);
        } else if (state == CycleState.PHASE1_READY) {
            executePhase1(currentCycleId);
        } else if (state == CycleState.PHASE2_READY) {
            executePhase2(currentCycleId);
        } else {
            revert("cycle not ready for execution");
        }
    }

    // ─── Owner admin (Timelock) ──────────────────────────────────────────────────

    /// @notice Cancel an active cycle before Phase 1 has been executed.
    ///         Once TheOffering has been called, the cycle must run to completion.
    function cancelCycle(uint256 cycleId) external onlyOwner {
        require(cycleId > 0 && cycleId <= currentCycleId, "invalid cycleId");
        Cycle storage c = _cycles[cycleId];
        require(!c.phase1Executed, "phase1 already executed");
        require(!c.cancelled,      "already cancelled");
        c.cancelled = true;
        emit CycleCancelled(cycleId, msg.sender);
    }

    /// @notice Update the Safe authorized to start voting rounds directly.
    function setVoteAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "admin=0");
        emit VoteAdminUpdated(voteAdmin, newAdmin);
        voteAdmin = newAdmin;
    }

    /// @notice Legacy compatibility setting; no longer restricts ballot membership.
    function setMaxBallotSize(uint256 newMax) external onlyOwner {
        require(newMax > 0, "max=0");
        emit MaxBallotSizeUpdated(maxBallotSize, newMax);
        maxBallotSize = newMax;
    }

    // ─── Views ───────────────────────────────────────────────────────────────────

    function getCycleState(uint256 cycleId) public view returns (CycleState) {
        if (cycleId == 0 || cycleId > currentCycleId) return CycleState.INACTIVE;
        Cycle storage c = _cycles[cycleId];
        if (c.cancelled)                           return CycleState.CANCELLED;
        if (c.phase2Executed)                      return CycleState.COMPLETED;
        if (c.phase1Executed) {
            return block.timestamp >= c.phase2End
                ? CycleState.PHASE2_READY
                : CycleState.PHASE2_OPEN;
        }
        return block.timestamp >= c.phase1End
            ? CycleState.PHASE1_READY
            : CycleState.PHASE1_OPEN;
    }

    /// @notice Permissionless, bounded preparation; no party selects ballot members.
    /// Advisory compatibility cache only; not used for ballot construction.
    function syncPoolIndex(uint256 maxPools) external {
        require(maxPools > 0 && maxPools <= MAX_INDEX_BATCH, "invalid index batch");
        _syncPoolIndex(maxPools);
    }

    function _syncPoolIndex(uint256 maxPools) private {
        // Deprecated advisory history only. Cycle preparation scans its own frozen
        // pool-count boundary and never depends on this cache. No global compaction.
        uint256 poolLen = stakingPools.poolLength();
        require(poolLen >= indexedPoolCount, "pool history changed");
        uint256 end = Math.min(poolLen, indexedPoolCount + maxPools);
        for (uint256 pid = indexedPoolCount; pid < end; pid++) {
            if (!stakingPools.poolFullyRemoved(pid)) {
                _indexedPools.push(pid);
            }
        }
        indexedPoolCount = end;
        emit PoolIndexSynced(end, _indexedPools.length);
    }

    /// @notice Permissionless preparation of at most maxPools IDs in deterministic PID order.
    /// Only the count is frozen at Safe start. Wallet/removal/approval are read when
    /// each ID is processed; Timelock changes cannot rewrite already-added members.
    function prepareBallot(uint256 cycleId, uint256 maxPools) external {
        CycleState state = getCycleState(cycleId);
        require(state == CycleState.PHASE1_OPEN || state == CycleState.PHASE1_READY, "not preparing phase1");
        require(maxPools > 0 && maxPools <= MAX_INDEX_BATCH, "invalid preparation batch");
        require(!_cycles[cycleId].ballotComplete, "ballot already complete");
        _prepareBallot(cycleId, maxPools);
    }

    function _prepareBallot(uint256 cycleId, uint256 maxPools) private {
        Cycle storage c = _cycles[cycleId];
        uint256 end = Math.min(c.preparationPoolCount, c.preparationCursor + maxPools);
        address[] memory added = new address[](end - c.preparationCursor);
        uint256 count;
        for (uint256 pid = c.preparationCursor; pid < end; ++pid) {
            if (stakingPools.poolFullyRemoved(pid)) continue;
            (address wallet,) = stakingPools.getPoolInfo(pid);
            if (wallet == address(0) || c.onBallot[wallet]) continue;
            require(extendOliveBranch.approvedNonprofit(wallet), "ballot address not approved in ExtendOliveBranch");
            c.onBallot[wallet] = true;
            c.ballot.push(wallet);
            c.ballotPosition[wallet] = c.ballot.length;
            added[count++] = wallet;
        }
        c.preparationCursor = end;
        assembly { mstore(added, count) }
        emit BallotBatchPrepared(cycleId, end, c.preparationPoolCount, added);
        if (end == c.preparationPoolCount) {
            require(c.ballot.length > 0, "empty ballot");
            c.ballotComplete = true;
            emit BallotPreparationCompleted(cycleId, c.ballot.length);
        }
    }

    function getCyclePreparation(uint256 cycleId) external view returns(uint256 cursor, uint256 poolCount, bool complete, uint256 ballotSize) {
        Cycle storage c = _cycles[cycleId];
        return (c.preparationCursor, c.preparationPoolCount, !c.incrementalBallot || c.ballotComplete, c.ballot.length);
    }

    function getBallotPage(uint256 cycleId, uint256 offset, uint256 limit) external view returns(address[] memory page) {
        require(limit > 0 && limit <= MAX_INDEX_BATCH, "invalid page size");
        Cycle storage c = _cycles[cycleId];
        if (offset >= c.ballot.length) return new address[](0);
        uint256 length = Math.min(limit, c.ballot.length - offset);
        page = new address[](length);
        for (uint256 i; i < length; ++i) page[i] = c.ballot[offset + i];
    }

    function getIndexedPools() external view returns (uint256[] memory) { return _indexedPools; }

    /// @notice Live information, NOT the frozen eligibility/power for an existing cycle.
    /// The legacy fallback is a view-only scan until a wallet's stake is checkpointed.
    function getCurrentVoterInfo(address user) external view returns (
        uint256 registeredTokenId, uint256 stakedBalance, uint256 votingPower, bool eligible
    ) {
        if (address(nftVault) != address(0)) registeredTokenId = nftVault.registeredTokenId(user);
        if (stakingPools.checkpointCount(user) > 0) {
            stakedBalance = stakingPools.totalStakedByUser(user);
        } else {
            uint256 length = stakingPools.poolLength();
            for (uint256 pid; pid < length; pid++) stakedBalance += stakingPools.userAmount(pid, user);
        }
        eligible = registeredTokenId != 0 && stakedBalance >= MIN_VOTING_STAKE;
        if (eligible) votingPower = squareRootVotingPower(stakedBalance);
    }

    function getCycleParticipation(uint256 cycleId) external view returns (
        uint256 registeredAtSnapshot, uint256 phase1Voters, uint256 phase2Voters,
        uint256 phase2VotingPower, bool recorded
    ) {
        Cycle storage c = _cycles[cycleId];
        return (c.registeredAtSnapshot, c.phase1Voters, c.phase2Voters, c.phase2VotingPower, c.analyticsRecorded);
    }

    /// @notice Confirmed settlement only; legacy outcomes require historical events.
    function getPhase2Result(uint256 cycleId) external view returns (
        address winner, uint256 amount, bool rolledOver, bool finalized, bool recorded
    ) {
        Cycle storage c = _cycles[cycleId];
        return (c.settledWinner, c.settledAmount,
            c.analyticsRecorded && c.phase2Executed && c.settledWinner == address(0),
            c.phase2Executed, c.analyticsRecorded);
    }

    function getBallot(uint256 cycleId) external view returns (address[] memory) {
        return _cycles[cycleId].ballot;
    }

    function getCycleSummary(uint256 cycleId) external view returns (
        uint48        snapshotBlock,
        uint64        phase1End,
        uint64        phase2End,
        uint256       burnVotes,
        uint256       giveVotes,
        Phase1Outcome phase1Outcome,
        bool          phase1Executed,
        bool          phase2Executed,
        bool          cancelled
    ) {
        Cycle storage c = _cycles[cycleId];
        return (
            c.snapshotBlock,
            c.phase1End,
            c.phase2End,
            c.burnVotes,
            c.giveVotes,
            c.phase1Outcome,
            c.phase1Executed,
            c.phase2Executed,
            c.cancelled
        );
    }

    /// @notice Final Phase 2 allocation: start balance plus this cycle's GIVE, if any.
    /// @return amount Amount reserved by governance accounting (not segregated in the vault).
    /// @return isFixed False before Phase 1 execution and for cycles executed before this upgrade.
    ///         Historical allocations must be read from Phase2Executed events, not inferred as zero.
    function getPhase2Allocation(uint256 cycleId) external view returns (uint256 amount, bool isFixed) {
        Cycle storage c = _cycles[cycleId];
        return (c.phase2Allocation, c.phase2AllocationFixed);
    }

    /// @notice Monetary balances captured at Phase 1 start. False for legacy cycles.
    /// Funds remain in the existing contracts; this is accounting, not segregated custody.
    function getCycleFundSnapshot(uint256 cycleId) external view returns (
        uint256 offeringAmount, uint256 extendAmount, bool isFixed
    ) {
        Cycle storage c = _cycles[cycleId];
        return (c.offeringAllocation, c.extendAllocationAtStart, c.fundsFixedAtStart);
    }

    function getNonprofitVotes(uint256 cycleId, address nonprofit) external view returns (uint256) {
        return _cycles[cycleId].nonprofitVotes[nonprofit];
    }

    function hasVotedPhase1(uint256 cycleId, address voter) external view returns (bool) {
        return _cycles[cycleId].votedPhase1[voter];
    }

    function hasVotedPhase2(uint256 cycleId, address voter) external view returns (bool) {
        return _cycles[cycleId].votedPhase2[voter];
    }

    /// @notice Returns the voting power of `user` at the snapshot block for `cycleId`.
    ///
    /// `bootstrapped` is false when the user has no post-upgrade checkpoint yet.
    /// In that case `power` is 0 even if they have stake — it will become non-zero
    /// automatically when they cast their first vote (lazy bootstrap) or when someone
    /// calls bootstrapCheckpoint for them, provided NFT eligibility is met for new cycles.
    /// For NFT cycles, power is zero without registration and otherwise uses sqrt(stake),
    /// expressed in 18-decimal VP units. Historical linear cycles are not reinterpreted.
    ///
    /// Returns (0, false) if cycleId does not exist.
    function getVotingPowerForCycle(uint256 cycleId, address user)
        external
        view
        returns (uint256 power, bool bootstrapped)
    {
        if (cycleId == 0 || cycleId > currentCycleId) return (0, false);
        bootstrapped = stakingPools.checkpointCount(user) > 0;
        power = _powerForCycle(cycleId, user);
    }
}
