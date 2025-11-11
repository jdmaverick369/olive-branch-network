// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockStakingPoolsForGovernance
 * @notice Mock contract for testing VotingPowerAdapter
 * @dev Simulates minimal StakingPools interface needed for governance
 */
contract MockStakingPoolsForGovernance {
    struct Pool {
        address charityWallet;
        uint256 totalStaked;
    }

    Pool[] public pools;
    mapping(uint256 => mapping(address => uint256)) public userAmount;
    mapping(address => uint64) public stakedSince;
    uint256 public globalTotalStaked;

    function addPool(address charityWallet) external {
        pools.push(Pool({
            charityWallet: charityWallet,
            totalStaked: 0
        }));
    }

    function poolLength() external view returns (uint256) {
        return pools.length;
    }

    function getPoolInfo(uint256 pid) external view returns (address charityWallet, uint256 totalStaked) {
        Pool memory pool = pools[pid];
        return (pool.charityWallet, pool.totalStaked);
    }

    function setGlobalTotalStaked(uint256 amount) external {
        globalTotalStaked = amount;
    }

    /**
     * @dev Mock staking function for tests
     * Sets stakedSince to current timestamp on first stake
     */
    function mockStake(address user, uint256 pid, uint256 amount) external {
        require(pid < pools.length, "Pool does not exist");

        // Set stakedSince on first stake
        if (stakedSince[user] == 0) {
            stakedSince[user] = uint64(block.timestamp);
        }

        userAmount[pid][user] += amount;
        pools[pid].totalStaked += amount;
        globalTotalStaked += amount;
    }

    /**
     * @dev Mock unstake function for tests
     */
    function mockUnstake(address user, uint256 pid, uint256 amount) external {
        require(pid < pools.length, "Pool does not exist");
        require(userAmount[pid][user] >= amount, "Insufficient stake");

        userAmount[pid][user] -= amount;
        pools[pid].totalStaked -= amount;
        globalTotalStaked -= amount;
    }

    /**
     * @dev Manually set stakedSince for testing edge cases
     */
    function setStakedSince(address user, uint64 timestamp) external {
        stakedSince[user] = timestamp;
    }
}
