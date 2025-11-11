// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/governance/GovernorUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorSettingsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorTimelockControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface IVotingPowerAdapter {
    function getVotingPower(address voter, uint256 snapshotTime)
        external view returns (uint256 totalPower, uint256[] memory eligiblePids);
    function getQuorum() external view returns (uint256);
    function getProposalThreshold() external view returns (uint256);
}

interface IGovernanceExecutor {
    function executeAddPool(address charityWallet, uint256 votesReceived) external;
    function startPoolRemoval(uint256 pid, address[] calldata users) external returns (bytes32);
    function executeAPYUpdate(uint256[] calldata starts, uint256[] calldata ends, uint256[] calldata bps) external;
    function executeProtocolUpgrade(address newImplementation, string calldata newVersion) external;
}

/**
 * @title OBNGovernor
 * @notice Main governance contract for OBN DAO
 * @dev Supports 4 proposal types with staking-based voting power
 */
contract OBNGovernor is
    GovernorUpgradeable,
    GovernorSettingsUpgradeable,
    GovernorCountingSimpleUpgradeable,
    GovernorTimelockControlUpgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    IVotingPowerAdapter public votingPowerAdapter;
    IGovernanceExecutor public governanceExecutor;

    // Proposal type enum
    enum ProposalType {
        ADD_POOL,
        REMOVE_POOL,
        UPDATE_APY,
        PROTOCOL_UPGRADE
    }

    // Proposal data structures
    struct AddPoolProposal {
        address[] nonprofits; // 1-4 nonprofit addresses
        bool isSingleChoice;   // true = yes/no vote, false = multi-choice
    }

    struct RemovePoolProposal {
        uint256 pid;
        address[] users; // Users to force-exit (prepared off-chain)
    }

    struct UpdateAPYProposal {
        uint256[] starts;
        uint256[] ends;
        uint256[] bps;
    }

    struct ProtocolUpgradeProposal {
        address newImplementation;
        string newVersion;
    }

    // Proposal type tracking
    mapping(uint256 => ProposalType) public proposalTypes;
    mapping(uint256 => AddPoolProposal) private _addPoolProposals;
    mapping(uint256 => RemovePoolProposal) private _removePoolProposals;
    mapping(uint256 => UpdateAPYProposal) private _updateAPYProposals;
    mapping(uint256 => ProtocolUpgradeProposal) private _protocolUpgradeProposals;

    // Add Pool voting (multi-choice support)
    // For single-choice: uses standard for/against/abstain
    // For multi-choice: support value = nonprofit index
    mapping(uint256 => mapping(uint256 => uint256)) public addPoolVotes; // proposalId => nonprofitIndex => votes

    // Events
    event AddPoolProposalCreated(uint256 indexed proposalId, address[] nonprofits, bool isSingleChoice);
    event RemovePoolProposalCreated(uint256 indexed proposalId, uint256 pid);
    event UpdateAPYProposalCreated(uint256 indexed proposalId, uint256 phaseCount);
    event ProtocolUpgradeProposalCreated(uint256 indexed proposalId, address newImplementation, string newVersion);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _votingPowerAdapter,
        address _governanceExecutor,
        address _timelock,
        address _initialOwner
    ) public initializer {
        __Governor_init("OBN Governor");
        __GovernorSettings_init(
            1,      // 1 block voting delay
            50400,  // ~7 days voting period (12s blocks)
            0       // 0 proposal threshold (will use adapter's threshold)
        );
        __GovernorCountingSimple_init();
        __GovernorTimelockControl_init(TimelockControllerUpgradeable(payable(_timelock)));
        __UUPSUpgradeable_init();
        __Ownable_init(_initialOwner);

        votingPowerAdapter = IVotingPowerAdapter(_votingPowerAdapter);
        governanceExecutor = IGovernanceExecutor(_governanceExecutor);
    }

    // ============================================================================
    // PROPOSAL CREATION
    // ============================================================================

    /**
     * @notice Create an Add Pool proposal
     * @param nonprofits Array of 1-4 nonprofit addresses
     * @param description Proposal description
     * @dev Only owner can create proposals (centralized governance)
     */
    function proposeAddPool(
        address[] memory nonprofits,
        string memory description
    ) external onlyOwner returns (uint256) {
        require(nonprofits.length >= 1 && nonprofits.length <= 4, "1-4 nonprofits required");

        // Create standard proposal (empty targets/values/calldatas)
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        targets[0] = address(governanceExecutor);
        values[0] = 0;
        calldatas[0] = ""; // Actual execution handled in _execute override

        uint256 proposalId = propose(targets, values, calldatas, description);

        // Store proposal data
        bool isSingleChoice = nonprofits.length == 1;
        proposalTypes[proposalId] = ProposalType.ADD_POOL;
        _addPoolProposals[proposalId] = AddPoolProposal({
            nonprofits: nonprofits,
            isSingleChoice: isSingleChoice
        });

        emit AddPoolProposalCreated(proposalId, nonprofits, isSingleChoice);

        return proposalId;
    }

    /**
     * @notice Create a Remove Pool proposal
     * @param pid Pool ID to remove
     * @param users Array of users to force-exit (prepared off-chain)
     * @param description Proposal description
     * @dev Only owner can create proposals (centralized governance)
     */
    function proposeRemovePool(
        uint256 pid,
        address[] memory users,
        string memory description
    ) external onlyOwner returns (uint256) {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        targets[0] = address(governanceExecutor);
        values[0] = 0;
        calldatas[0] = "";

        uint256 proposalId = propose(targets, values, calldatas, description);

        proposalTypes[proposalId] = ProposalType.REMOVE_POOL;
        _removePoolProposals[proposalId] = RemovePoolProposal({
            pid: pid,
            users: users
        });

        emit RemovePoolProposalCreated(proposalId, pid);

        return proposalId;
    }

    /**
     * @notice Create an Update APY proposal
     * @param starts Phase start times
     * @param ends Phase end times
     * @param bps Basis points for each phase
     * @param description Proposal description
     * @dev Only owner can create proposals (centralized governance)
     */
    function proposeUpdateAPY(
        uint256[] memory starts,
        uint256[] memory ends,
        uint256[] memory bps,
        string memory description
    ) external onlyOwner returns (uint256) {
        require(starts.length == ends.length && ends.length == bps.length, "Array length mismatch");

        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        targets[0] = address(governanceExecutor);
        values[0] = 0;
        calldatas[0] = "";

        uint256 proposalId = propose(targets, values, calldatas, description);

        proposalTypes[proposalId] = ProposalType.UPDATE_APY;
        _updateAPYProposals[proposalId] = UpdateAPYProposal({
            starts: starts,
            ends: ends,
            bps: bps
        });

        emit UpdateAPYProposalCreated(proposalId, starts.length);

        return proposalId;
    }

    /**
     * @notice Create a Protocol Upgrade proposal
     * @param newImplementation New StakingPools implementation address
     * @param newVersion Version string (e.g., "8.10.0")
     * @param description Proposal description
     * @dev Only owner can create proposals (centralized governance)
     */
    function proposeProtocolUpgrade(
        address newImplementation,
        string memory newVersion,
        string memory description
    ) external onlyOwner returns (uint256) {
        require(newImplementation != address(0), "Invalid implementation");

        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        targets[0] = address(governanceExecutor);
        values[0] = 0;
        calldatas[0] = "";

        uint256 proposalId = propose(targets, values, calldatas, description);

        proposalTypes[proposalId] = ProposalType.PROTOCOL_UPGRADE;
        _protocolUpgradeProposals[proposalId] = ProtocolUpgradeProposal({
            newImplementation: newImplementation,
            newVersion: newVersion
        });

        emit ProtocolUpgradeProposalCreated(proposalId, newImplementation, newVersion);

        return proposalId;
    }

    // ============================================================================
    // VOTING OVERRIDES
    // ============================================================================

    /**
     * @notice Cast vote with support value
     * @dev For Add Pool multi-choice: support = nonprofit index (0-3)
     *      For Add Pool single-choice: support = 0 (against) or 1 (for)
     *      For other types: support = 0 (against), 1 (for), or 2 (abstain)
     */
    function _countVote(
        uint256 proposalId,
        address account,
        uint8 support,
        uint256 weight,
        bytes memory // params
    ) internal virtual override(GovernorUpgradeable, GovernorCountingSimpleUpgradeable) returns (uint256) {
        ProposalType pType = proposalTypes[proposalId];

        if (pType == ProposalType.ADD_POOL) {
            AddPoolProposal storage proposal = _addPoolProposals[proposalId];

            if (proposal.isSingleChoice) {
                // Single nonprofit: Yes/No vote (standard for/against)
                require(support <= 2, "Invalid support value");
                return super._countVote(proposalId, account, support, weight, "");
            } else {
                // Multiple nonprofits: Multi-choice vote
                require(support < proposal.nonprofits.length, "Invalid nonprofit index");
                addPoolVotes[proposalId][support] += weight;
                return weight;
            }
        } else {
            // All other proposal types use standard for/against/abstain
            require(support <= 2, "Invalid support value");
            return super._countVote(proposalId, account, support, weight, "");
        }
    }

    /**
     * @notice Check if proposal has succeeded
     * @dev For Add Pool multi-choice: always succeeds if quorum met (winner determined in execution)
     *      For others: standard majority vote
     */
    function _voteSucceeded(uint256 proposalId)
        internal
        view
        virtual
        override(GovernorUpgradeable, GovernorCountingSimpleUpgradeable)
        returns (bool)
    {
        ProposalType pType = proposalTypes[proposalId];

        if (pType == ProposalType.ADD_POOL) {
            AddPoolProposal storage proposal = _addPoolProposals[proposalId];

            if (proposal.isSingleChoice) {
                // Single nonprofit: standard for > against
                return super._voteSucceeded(proposalId);
            } else {
                // Multiple nonprofits: always succeeds if quorum met
                // Winner determined in execution
                return true;
            }
        } else {
            // Standard for > against
            return super._voteSucceeded(proposalId);
        }
    }

    /**
     * @notice Check if quorum has been reached
     * @dev For Add Pool multi-choice: check sum of all votes across all options
     *      For others: use standard quorum check
     */
    function _quorumReached(uint256 proposalId)
        internal
        view
        virtual
        override(GovernorUpgradeable, GovernorCountingSimpleUpgradeable)
        returns (bool)
    {
        ProposalType pType = proposalTypes[proposalId];

        if (pType == ProposalType.ADD_POOL) {
            AddPoolProposal storage proposal = _addPoolProposals[proposalId];

            if (!proposal.isSingleChoice) {
                // Multi-choice: sum all votes across all options
                uint256 totalVotes = 0;
                for (uint256 i = 0; i < proposal.nonprofits.length; i++) {
                    totalVotes += addPoolVotes[proposalId][i];
                }
                return totalVotes >= quorum(proposalSnapshot(proposalId));
            }
        }

        // All other cases: use standard quorum check
        return super._quorumReached(proposalId);
    }

    // ============================================================================
    // VOTING POWER (Using VotingPowerAdapter)
    // ============================================================================

    /**
     * @notice Get voting power from VotingPowerAdapter instead of token balance
     */
    function _getVotes(
        address account,
        uint256 timepoint,
        bytes memory // params
    ) internal view virtual override returns (uint256) {
        (uint256 votingPower, ) = votingPowerAdapter.getVotingPower(account, timepoint);
        return votingPower;
    }

    /**
     * @notice Returns the current timepoint (block.timestamp)
     */
    function clock() public view virtual override returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @notice Machine-readable description of the clock
     */
    function CLOCK_MODE() public pure virtual override returns (string memory) {
        return "mode=timestamp";
    }

    /**
     * @notice Use VotingPowerAdapter's quorum
     */
    function quorum(uint256 /* timepoint */)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return votingPowerAdapter.getQuorum();
    }

    /**
     * @notice Proposal threshold is 0 since only owner can propose
     * @dev Centralized governance: onlyOwner modifier on propose functions
     */
    function proposalThreshold()
        public
        pure
        virtual
        override(GovernorUpgradeable, GovernorSettingsUpgradeable)
        returns (uint256)
    {
        return 0; // No threshold needed - only owner can propose
    }

    // ============================================================================
    // EXECUTION
    // ============================================================================

    /**
     * @notice Execute proposal via GovernanceExecutor
     */
    function _executeOperations(
        uint256 proposalId,
        address[] memory, // targets
        uint256[] memory, // values
        bytes[] memory,   // calldatas
        bytes32           // descriptionHash
    ) internal virtual override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) {
        ProposalType pType = proposalTypes[proposalId];

        if (pType == ProposalType.ADD_POOL) {
            _executeAddPool(proposalId);
        } else if (pType == ProposalType.REMOVE_POOL) {
            _executeRemovePool(proposalId);
        } else if (pType == ProposalType.UPDATE_APY) {
            _executeUpdateAPY(proposalId);
        } else if (pType == ProposalType.PROTOCOL_UPGRADE) {
            _executeProtocolUpgrade(proposalId);
        }
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal virtual override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        virtual
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _executeAddPool(uint256 proposalId) internal {
        AddPoolProposal storage proposal = _addPoolProposals[proposalId];

        address winner;
        uint256 votesReceived;

        if (proposal.isSingleChoice) {
            // Single nonprofit: winner is the only one
            winner = proposal.nonprofits[0];
            (uint256 forVotes, , ) = proposalVotes(proposalId);
            votesReceived = forVotes;
        } else {
            // Multiple nonprofits: find winner
            uint256 maxVotes = 0;
            uint256 winnerIndex = 0;

            for (uint256 i = 0; i < proposal.nonprofits.length; i++) {
                uint256 votes = addPoolVotes[proposalId][i];
                if (votes > maxVotes) {
                    maxVotes = votes;
                    winnerIndex = i;
                }
            }

            winner = proposal.nonprofits[winnerIndex];
            votesReceived = maxVotes;
        }

        governanceExecutor.executeAddPool(winner, votesReceived);
    }

    function _executeRemovePool(uint256 proposalId) internal {
        RemovePoolProposal storage proposal = _removePoolProposals[proposalId];
        governanceExecutor.startPoolRemoval(proposal.pid, proposal.users);
    }

    function _executeUpdateAPY(uint256 proposalId) internal {
        UpdateAPYProposal storage proposal = _updateAPYProposals[proposalId];
        governanceExecutor.executeAPYUpdate(proposal.starts, proposal.ends, proposal.bps);
    }

    function _executeProtocolUpgrade(uint256 proposalId) internal {
        ProtocolUpgradeProposal storage proposal = _protocolUpgradeProposals[proposalId];
        governanceExecutor.executeProtocolUpgrade(proposal.newImplementation, proposal.newVersion);
    }

    // ============================================================================
    // OVERRIDES (Required by Solidity)
    // ============================================================================

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal virtual override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        virtual
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (address)
    {
        return super._executor();
    }

    function state(uint256 proposalId)
        public
        view
        virtual
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(GovernorUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============================================================================
    // ADMIN
    // ============================================================================

    function updateVotingPowerAdapter(address newAdapter) external onlyOwner {
        votingPowerAdapter = IVotingPowerAdapter(newAdapter);
    }

    function updateGovernanceExecutor(address newExecutor) external onlyOwner {
        governanceExecutor = IGovernanceExecutor(newExecutor);
    }
}
