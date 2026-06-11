// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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
}

interface ITheOffering {
    function burn(uint256 amount) external;
    function sendToExtend(uint256 amount) external;
}

interface IExtendOliveBranch {
    function distributeFromGovernance(address nonprofit, uint256 amount) external;
    function approvedNonprofit(address nonprofit) external view returns (bool);
}

/// @title AnnualGovernance
/// @notice Two-phase annual governance for Olive Branch Network. UUPS upgradeable behind Timelock.
///
/// Phase 1 (Burn/Give): stakers vote whether TheOffering's accumulated OBN balance is
///   burned or sent to ExtendOliveBranch. BURN wins unless GIVE strictly exceeds BURN.
///   Zero participation → BURN.
///
/// Phase 2 (Nonprofit): stakers vote which approved nonprofit receives ExtendOliveBranch's
///   OBN balance. Zero participation → rollover (funds stay for next cycle).
///   Tie → first in ballot (lowest index) wins.
///
/// Both phases share a single snapshot taken at cycle start. Phase 2 always runs after
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
contract AnnualGovernance is Initializable, OwnableUpgradeable, UUPSUpgradeable {

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
    // Slots 8-57: __gap

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
    uint256[50] private __gap; // slots 8-57

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
    event Phase2Started(uint256 indexed cycleId, uint64 phase2End);
    event Phase2Executed(uint256 indexed cycleId, address indexed winner, uint256 amount);
    event Phase2RolledOver(uint256 indexed cycleId);
    event CycleCancelled(uint256 indexed cycleId, address indexed cancelledBy);
    event VoteAdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event MaxBallotSizeUpdated(uint256 oldSize, uint256 newSize);

    // ─── Modifiers ───────────────────────────────────────────────────────────────

    modifier onlyVoteAdmin() {
        require(msg.sender == voteAdmin, "not voteAdmin");
        _;
    }

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

    function _authorizeUpgrade(address) internal override onlyOwner {
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

    /// @notice Start a new annual cycle. Builds the ballot from active pools, validates
    ///         the ExtendOliveBranch whitelist, and takes a voting power snapshot.
    /// @param phase1Duration Seconds for the Burn/Give voting window. Min: 1 day.
    /// @param phase2Duration Seconds for the Nonprofit voting window. Min: 1 day.
    function startAnnualCycle(uint64 phase1Duration, uint64 phase2Duration) external onlyVoteAdmin {
        require(phase1Duration >= 1 days, "phase1 too short");
        require(phase2Duration >= 1 days, "phase2 too short");

        if (currentCycleId > 0) {
            CycleState prev = getCycleState(currentCycleId);
            require(
                prev == CycleState.COMPLETED || prev == CycleState.CANCELLED,
                "previous cycle not complete"
            );
        }

        // ── Build ballot ──────────────────────────────────────────────────────
        uint256 poolLen = stakingPools.poolLength();
        address[] memory tempBallot = new address[](poolLen);
        uint256 ballotLen = 0;

        for (uint256 pid = 0; pid < poolLen; pid++) {
            if (stakingPools.poolFullyRemoved(pid)) continue;

            (address wallet,) = stakingPools.getPoolInfo(pid);
            if (wallet == address(0)) continue;

            // Deduplicate: O(n²) on poolLen, acceptable for maxBallotSize <= 100
            bool seen = false;
            for (uint256 j = 0; j < ballotLen; j++) {
                if (tempBallot[j] == wallet) { seen = true; break; }
            }
            if (seen) continue;

            require(ballotLen < maxBallotSize, "ballot exceeds maxBallotSize");
            tempBallot[ballotLen++] = wallet;
        }

        require(ballotLen > 0, "empty ballot");

        // ── Option 3 whitelist check ──────────────────────────────────────────
        // Every ballot address must be approved in ExtendOliveBranch before the
        // cycle can start. This prevents a vote from beginning with a ballot that
        // cannot be executed.
        uint256 cycleId = ++currentCycleId;
        Cycle storage c = _cycles[cycleId];

        address[] memory finalBallot = new address[](ballotLen);
        for (uint256 i = 0; i < ballotLen; i++) {
            address addr = tempBallot[i];
            require(
                extendOliveBranch.approvedNonprofit(addr),
                "ballot address not approved in ExtendOliveBranch"
            );
            finalBallot[i]    = addr;
            c.ballot.push(addr);
            c.onBallot[addr]  = true;
        }

        // Snapshot one block before cycle start so any stake deposited in the same
        // block as startAnnualCycle cannot be counted toward voting power.
        uint48 snap      = uint48(block.number - 1);
        c.snapshotBlock  = snap;
        c.phase1End      = uint64(block.timestamp) + phase1Duration;
        c.phase2Duration = phase2Duration;
        // phase2End is intentionally not set here; it is set in executePhase1() so
        // Phase 2 always receives its full duration regardless of when Phase 1 is executed.

        emit CycleStarted(cycleId, snap, c.phase1End, phase2Duration, finalBallot);
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

        uint256 power = stakingPools.getPastVotingPower(msg.sender, uint256(c.snapshotBlock));
        require(power > 0, "no voting power at snapshot");

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

        uint256 power = stakingPools.getPastVotingPower(msg.sender, uint256(c.snapshotBlock));
        require(power > 0, "no voting power at snapshot");

        c.nonprofitVotes[nonprofit] += power;

        emit NonprofitVoteCast(cycleId, msg.sender, nonprofit, power);
    }

    // ─── Execution (permissionless) ──────────────────────────────────────────────

    /// @notice Execute Phase 1. Callable by anyone after phase1End.
    ///         BURN wins unless GIVE strictly exceeds BURN. Zero participation → BURN.
    ///         Calls TheOffering.burn() or TheOffering.sendToExtend() with the full balance.
    function executePhase1(uint256 cycleId) public {
        require(getCycleState(cycleId) == CycleState.PHASE1_READY, "not ready for phase1 execution");

        Cycle storage c = _cycles[cycleId];
        c.phase1Executed = true;
        c.phase1Outcome  = c.giveVotes > c.burnVotes ? Phase1Outcome.GIVE : Phase1Outcome.BURN;
        // Phase 2 gets its full duration starting from now, not from cycle start.
        c.phase2End      = uint64(block.timestamp) + c.phase2Duration;

        uint256 bal = obn.balanceOf(address(theOffering));
        if (bal > 0) {
            if (c.phase1Outcome == Phase1Outcome.GIVE) {
                theOffering.sendToExtend(bal);
            } else {
                theOffering.burn(bal);
            }
        }

        emit Phase1Executed(cycleId, c.phase1Outcome, bal, c.phase2End);
        emit Phase2Started(cycleId, c.phase2End);
    }

    /// @notice Execute Phase 2. Callable by anyone after phase2End and after phase1 is executed.
    ///         Winner is the nonprofit with the most votes; ties go to the lowest ballot index.
    ///         Zero participation → rollover (ExtendOliveBranch balance stays for next cycle).
    function executePhase2(uint256 cycleId) public {
        require(getCycleState(cycleId) == CycleState.PHASE2_READY, "not ready for phase2 execution");

        Cycle storage c  = _cycles[cycleId];
        c.phase2Executed = true;

        address winner   = address(0);
        uint256 maxVotes = 0;
        uint256 bLen     = c.ballot.length;

        for (uint256 i = 0; i < bLen; i++) {
            address np    = c.ballot[i];
            uint256 votes = c.nonprofitVotes[np];
            if (votes > maxVotes) {
                maxVotes = votes;
                winner   = np;
            }
        }

        if (maxVotes == 0) {
            emit Phase2RolledOver(cycleId);
        } else {
            uint256 bal = obn.balanceOf(address(extendOliveBranch));
            if (bal > 0) {
                extendOliveBranch.distributeFromGovernance(winner, bal);
            }
            emit Phase2Executed(cycleId, winner, bal);
        }
    }

    /// @notice Convenience dispatcher for keeper bots, Defender tasks, and community executors.
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
        if (state == CycleState.PHASE1_READY) {
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

    /// @notice Update the vote admin address.
    function setVoteAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "admin=0");
        emit VoteAdminUpdated(voteAdmin, newAdmin);
        voteAdmin = newAdmin;
    }

    /// @notice Update the maximum ballot size. Applies to future cycles only.
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
    /// calls bootstrapCheckpoint for them.
    ///
    /// Returns (0, false) if cycleId does not exist.
    function getVotingPowerForCycle(uint256 cycleId, address user)
        external
        view
        returns (uint256 power, bool bootstrapped)
    {
        if (cycleId == 0 || cycleId > currentCycleId) return (0, false);
        Cycle storage c = _cycles[cycleId];
        bootstrapped = stakingPools.checkpointCount(user) > 0;
        power = stakingPools.getPastVotingPower(user, uint256(c.snapshotBlock));
    }
}
