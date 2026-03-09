// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VotingPowerAdapter
 * @notice Calculates voting power based on staking positions with 14-day maturity requirement
 * @dev Integrates with OBNStakingPools to determine governance voting rights
 */
interface IStakingPools {
    function poolLength() external view returns (uint256);
    function userAmount(uint256 pid, address user) external view returns (uint256);
    function stakedSince(address user) external view returns (uint64);
    function getPoolInfo(uint256 pid) external view returns (address charityWallet, uint256 totalStaked);
    function globalTotalStaked() external view returns (uint256);
}

contract VotingPowerAdapter {
    IStakingPools public immutable stakingPools;
    uint256 public constant MATURITY_PERIOD = 14 days;

    // Fixed governance parameters (not percentage-based)
    uint256 public constant QUORUM = 1_000_000 ether; // 1M OBN required for quorum
    uint256 public constant PROPOSAL_THRESHOLD = 10_000 ether; // 10k OBN required to vote (with 14-day maturity)

    constructor(address _stakingPools) {
        require(_stakingPools != address(0), "VotingPowerAdapter: zero address");
        stakingPools = IStakingPools(_stakingPools);
    }

    /**
     * @notice Get voting power for a user at a specific snapshot time
     * @param voter The address to check voting power for
     * @param snapshotTime The timestamp to check voting power at (typically proposal creation time)
     * @return totalPower The total voting power in OBN wei
     * @return eligiblePids Array of pool IDs where user has eligible stakes
     */
    function getVotingPower(address voter, uint256 snapshotTime)
        public
        view
        returns (uint256 totalPower, uint256[] memory eligiblePids)
    {
        require(snapshotTime <= block.timestamp, "VotingPowerAdapter: future snapshot");

        uint256 poolLength = stakingPools.poolLength();
        uint256[] memory tempPids = new uint256[](poolLength);
        uint256 count = 0;

        // Get user's stake start time
        uint64 stakedSince = stakingPools.stakedSince(voter);

        // If user never staked, return 0 power
        if (stakedSince == 0) {
            return (0, new uint256[](0));
        }

        // Calculate age at snapshot
        uint256 ageAtSnapshot = snapshotTime - uint256(stakedSince);

        // Check maturity requirement
        if (ageAtSnapshot < MATURITY_PERIOD) {
            // User hasn't met 14-day maturity at snapshot time
            return (0, new uint256[](0));
        }

        // Aggregate stakes across all pools
        for (uint256 pid = 0; pid < poolLength; pid++) {
            uint256 userStake = stakingPools.userAmount(pid, voter);

            if (userStake > 0) {
                totalPower += userStake;
                tempPids[count] = pid;
                count++;
            }
        }

        // Trim array to actual size
        eligiblePids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            eligiblePids[i] = tempPids[i];
        }

        return (totalPower, eligiblePids);
    }

    /**
     * @notice Get current voting power (using block.timestamp as snapshot)
     * @param voter The address to check voting power for
     * @return totalPower The total voting power in OBN wei
     * @return eligiblePids Array of pool IDs where user has eligible stakes
     */
    function getCurrentVotingPower(address voter)
        external
        view
        returns (uint256 totalPower, uint256[] memory eligiblePids)
    {
        return getVotingPower(voter, block.timestamp);
    }

    /**
     * @notice Check if a user meets maturity requirement at a given snapshot
     * @param voter The address to check
     * @param snapshotTime The timestamp to check at
     * @return True if user has 14+ day maturity at snapshot time
     */
    function hasMaturity(address voter, uint256 snapshotTime) external view returns (bool) {
        uint64 stakedSince = stakingPools.stakedSince(voter);
        if (stakedSince == 0) return false;

        uint256 ageAtSnapshot = snapshotTime - uint256(stakedSince);
        return ageAtSnapshot >= MATURITY_PERIOD;
    }

    /**
     * @notice Get global quorum requirement (fixed at 1M OBN)
     * @return Quorum in OBN wei
     */
    function getQuorum() external pure returns (uint256) {
        return QUORUM;
    }

    /**
     * @notice Get proposal threshold (fixed at 10k OBN, with 14-day maturity required)
     * @return Threshold in OBN wei
     */
    function getProposalThreshold() external pure returns (uint256) {
        return PROPOSAL_THRESHOLD;
    }

    /**
     * @notice Get detailed voting power breakdown for a user
     * @param voter The address to check
     * @param snapshotTime The timestamp to check at
     * @return totalPower Total voting power
     * @return poolCount Number of pools with eligible stakes
     * @return meetsMaturity Whether user meets 14-day maturity requirement
     * @return stakedSince When the user first staked (0 if never staked)
     */
    function getVotingPowerDetails(address voter, uint256 snapshotTime)
        external
        view
        returns (
            uint256 totalPower,
            uint256 poolCount,
            bool meetsMaturity,
            uint64 stakedSince
        )
    {
        stakedSince = stakingPools.stakedSince(voter);

        if (stakedSince == 0) {
            return (0, 0, false, 0);
        }

        uint256 ageAtSnapshot = snapshotTime - uint256(stakedSince);
        meetsMaturity = ageAtSnapshot >= MATURITY_PERIOD;

        if (!meetsMaturity) {
            return (0, 0, false, stakedSince);
        }

        // Calculate voting power
        uint256 poolLength = stakingPools.poolLength();
        poolCount = 0;

        for (uint256 pid = 0; pid < poolLength; pid++) {
            uint256 userStake = stakingPools.userAmount(pid, voter);
            if (userStake > 0) {
                totalPower += userStake;
                poolCount++;
            }
        }

        return (totalPower, poolCount, meetsMaturity, stakedSince);
    }
}
