// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GovernanceExecutor
 * @notice Automated execution logic for OBN DAO governance proposals
 * @dev Handles 4 proposal types: Add Pool, Remove Pool, Update APY, Protocol Upgrade
 */

interface IStakingPools {
    function addPool(address charityWallet) external returns (uint256 pid);
    function bootstrapFromCharityFund(uint256 pid, uint256 amount, bool lockThisDeposit) external;
    function shutdownPool(uint256 pid) external;
    function removePool(uint256 pid) external;
    function forceExitUser(uint256 pid, address user) external;
    function forceExitUser(uint256 pid, address user, address recipient) external; // v8.10.0+
    function getPoolInfo(uint256 pid) external view returns (address charityWallet, uint256 totalStaked);
    function userAmount(uint256 pid, address user) external view returns (uint256);
    function charityFund() external view returns (address);
    function poolLength() external view returns (uint256);
    function upgradeTo(address newImplementation) external; // UUPS upgrade
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

contract GovernanceExecutor is Ownable, ReentrancyGuard {
    IStakingPools public stakingPools;

    uint256 public constant BOOTSTRAP_AMOUNT = 1_000_000 ether; // 1M OBN
    uint256 public constant BATCH_SIZE = 50; // Force-exit batch size

    // Proposal type enums
    enum ProposalType {
        ADD_POOL,
        REMOVE_POOL,
        UPDATE_APY,
        PROTOCOL_UPGRADE
    }

    // Remove pool state tracking
    struct RemovalState {
        uint256 pid;
        address[] users;
        uint256 processedCount;
        bool completed;
    }

    mapping(bytes32 => RemovalState) public removalStates;

    // Events
    event PoolAdded(uint256 indexed pid, address indexed charityWallet, uint256 votesReceived);
    event PoolRemovalStarted(uint256 indexed pid, uint256 userCount);
    event PoolRemovalBatchProcessed(uint256 indexed pid, uint256 batchStart, uint256 batchEnd);
    event PoolRemovalCompleted(uint256 indexed pid);
    event APYUpdated(uint256 phaseCount);
    event ProtocolUpgraded(address indexed newImplementation, string version);

    constructor(address _stakingPools, address _initialOwner) Ownable(_initialOwner) {
        require(_stakingPools != address(0), "GovernanceExecutor: zero address");
        stakingPools = IStakingPools(_stakingPools);
    }

    // ============================================================================
    // PROPOSAL TYPE 1: ADD POOL
    // ============================================================================

    /**
     * @notice Execute an "Add Pool" proposal
     * @param charityWallet The winning nonprofit's wallet address
     * @param votesReceived Total votes the winner received (for event logging)
     */
    function executeAddPool(address charityWallet, uint256 votesReceived)
        external
        onlyOwner
        nonReentrant
    {
        require(charityWallet != address(0), "Invalid charity wallet");

        // Step 1: Add pool
        uint256 pid = stakingPools.addPool(charityWallet);

        // Step 2: Bootstrap with 1M OBN from charityFund
        stakingPools.bootstrapFromCharityFund(pid, BOOTSTRAP_AMOUNT, true);

        emit PoolAdded(pid, charityWallet, votesReceived);
    }

    // ============================================================================
    // PROPOSAL TYPE 2: REMOVE POOL (BATCHED)
    // ============================================================================

    /**
     * @notice Start pool removal process (Step 1: Shutdown + enumerate users)
     * @param pid The pool ID to remove
     * @param users Array of all users staked in this pool (prepared off-chain)
     * @return removalId Unique identifier for tracking batched removal
     */
    function startPoolRemoval(uint256 pid, address[] calldata users)
        external
        onlyOwner
        nonReentrant
        returns (bytes32 removalId)
    {
        // Step 1: Shutdown pool (disable new deposits)
        stakingPools.shutdownPool(pid);

        // Generate removal ID
        removalId = keccak256(abi.encodePacked(pid, block.timestamp));

        // Store removal state
        removalStates[removalId] = RemovalState({
            pid: pid,
            users: users,
            processedCount: 0,
            completed: false
        });

        emit PoolRemovalStarted(pid, users.length);
        return removalId;
    }

    /**
     * @notice Process a batch of force-exits for pool removal
     * @param removalId The removal process identifier
     * @param batchSize Number of users to process in this batch (max 50)
     */
    function processRemovalBatch(bytes32 removalId, uint256 batchSize)
        external
        onlyOwner
        nonReentrant
    {
        RemovalState storage state = removalStates[removalId];
        require(!state.completed, "Removal already completed");
        require(batchSize <= BATCH_SIZE, "Batch size too large");

        uint256 start = state.processedCount;
        uint256 end = start + batchSize;
        if (end > state.users.length) {
            end = state.users.length;
        }

        // Force-exit users in this batch
        for (uint256 i = start; i < end; i++) {
            address user = state.users[i];
            uint256 userStake = stakingPools.userAmount(state.pid, user);

            if (userStake > 0) {
                // This will claim pending rewards + return staked tokens
                stakingPools.forceExitUser(state.pid, user);
            }
        }

        state.processedCount = end;

        emit PoolRemovalBatchProcessed(state.pid, start, end);
    }

    /**
     * @notice Complete pool removal (Step 3: Return bootstrap + remove pool)
     * @param removalId The removal process identifier
     * @dev Requires all users to be processed first
     */
    function completePoolRemoval(bytes32 removalId)
        external
        onlyOwner
        nonReentrant
    {
        RemovalState storage state = removalStates[removalId];
        require(!state.completed, "Already completed");
        require(state.processedCount >= state.users.length, "Users not fully processed");

        uint256 pid = state.pid;

        // Get charity wallet and charityFund
        (address charityWallet, ) = stakingPools.getPoolInfo(pid);
        address charityFund = stakingPools.charityFund();

        // Try to return bootstrap to charityFund
        // This requires v8.10.0+ with forceExitUser(pid, user, recipient)
        try stakingPools.forceExitUser(pid, charityWallet, charityFund) {
            // Successfully returned bootstrap
        } catch {
            // v8.9.0 or earlier - bootstrap stays locked
            // This is acceptable; can be manually handled later
        }

        // Remove pool (marks as removed, prevents future use)
        stakingPools.removePool(pid);

        state.completed = true;

        emit PoolRemovalCompleted(pid);
    }

    /**
     * @notice Get removal state details
     * @param removalId The removal process identifier
     */
    function getRemovalState(bytes32 removalId)
        external
        view
        returns (
            uint256 pid,
            uint256 totalUsers,
            uint256 processedCount,
            bool completed
        )
    {
        RemovalState storage state = removalStates[removalId];
        return (state.pid, state.users.length, state.processedCount, state.completed);
    }

    // ============================================================================
    // PROPOSAL TYPE 3: UPDATE APY
    // ============================================================================

    /**
     * @notice Execute APY update (not implemented in StakingPools v8.9.0)
     * @dev This is a placeholder for future StakingPools versions
     * @dev In practice, would call stakingPools.updatePhases() or similar
     */
    function executeAPYUpdate(
        uint256[] calldata starts,
        uint256[] calldata ends,
        uint256[] calldata bps
    )
        external
        onlyOwner
        nonReentrant
    {
        require(starts.length == ends.length && ends.length == bps.length, "Array length mismatch");

        // NOTE: StakingPools v8.9.0 doesn't have updatePhases() function
        // This would need to be added in a future upgrade
        // For now, this is a placeholder that emits an event

        // In future version:
        // for (uint256 i = 0; i < starts.length; i++) {
        //     stakingPools.updatePhase(i, starts[i], ends[i], bps[i]);
        // }

        emit APYUpdated(starts.length);
    }

    // ============================================================================
    // PROPOSAL TYPE 4: PROTOCOL UPGRADE
    // ============================================================================

    /**
     * @notice Execute a protocol upgrade to a new StakingPools implementation
     * @param newImplementation Address of the new implementation contract
     * @param newVersion Human-readable version string (e.g., "8.10.0-governance")
     * @dev This calls upgradeTo() on the StakingPools UUPS proxy
     */
    function executeProtocolUpgrade(address newImplementation, string calldata newVersion)
        external
        onlyOwner
        nonReentrant
    {
        require(newImplementation != address(0), "Invalid implementation");
        require(bytes(newVersion).length > 0, "Version required");

        // Perform UUPS upgrade
        stakingPools.upgradeTo(newImplementation);

        emit ProtocolUpgraded(newImplementation, newVersion);
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Update StakingPools address (emergency only)
     * @param newStakingPools New StakingPools proxy address
     */
    function updateStakingPools(address newStakingPools) external onlyOwner {
        require(newStakingPools != address(0), "Zero address");
        stakingPools = IStakingPools(newStakingPools);
    }

    /**
     * @notice Cancel an incomplete pool removal
     * @param removalId The removal process to cancel
     * @dev Emergency function if removal process gets stuck
     */
    function cancelRemoval(bytes32 removalId) external onlyOwner {
        RemovalState storage state = removalStates[removalId];
        require(!state.completed, "Already completed");

        state.completed = true; // Mark as completed to prevent further processing
    }
}
