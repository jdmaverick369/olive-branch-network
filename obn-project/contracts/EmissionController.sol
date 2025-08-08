// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IStakingPoolReader {
    function getTotalStakedAcrossPools() external view returns (uint256);
}

/**
 * @title EmissionsControllerLocked
 * @notice Immutable, hard-coded deflation schedule. Pools can be registered/removed,
 *         but the global emission phases cannot be changed after deployment.
 *
 * Phases (relative to `start` passed in constructor):
 *  - [start, start+2y)       : 1000 bps  (10%)
 *  - [start+2y, start+4y)    : 750  bps  (7.5%)
 *  - [start+4y, start+6y)    : 500  bps  (5%)
 *  - [start+6y, start+8y)    : 250  bps  (2.5%)
 *  - [start+8y, start+10y)   : 125  bps  (1.25%)
 */
contract EmissionsController {
    struct Phase { uint256 start; uint256 end; uint256 bps; }

    address public owner; // used only for pool registry ops (optional to renounce later)
    Phase[] public phases;

    address[] public pools;
    mapping(address => bool) public isPool;

    event OwnerChanged(address indexed newOwner);
    event PoolRegistered(address indexed pool);
    event PoolRemoved(address indexed pool);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address initialOwner, uint256 start) {
        require(initialOwner != address(0), "invalid owner");
        require(start > 0, "invalid start");
        owner = initialOwner;
        emit OwnerChanged(initialOwner);

        uint256 year = 365 days;

        // Hard-coded deflation schedule
        phases.push(Phase(start,             start + 2*year, 1000)); // 10%
        phases.push(Phase(start + 2*year,    start + 4*year,  750)); // 7.5%
        phases.push(Phase(start + 4*year,    start + 6*year,  500)); // 5%
        phases.push(Phase(start + 6*year,    start + 8*year,  250)); // 2.5%
        phases.push(Phase(start + 8*year,    start +10*year,  125)); // 1.25%
    }

    // -------- Optional admin (registry only) --------

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero addr");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function registerPool(address pool) external onlyOwner {
        require(pool != address(0), "zero addr");
        require(!isPool[pool], "already");
        isPool[pool] = true;
        pools.push(pool);
        emit PoolRegistered(pool);
    }

    function removePool(address pool) external onlyOwner {
        require(isPool[pool], "not found");
        isPool[pool] = false;
        uint256 n = pools.length;
        for (uint256 i = 0; i < n; i++) {
            if (pools[i] == pool) {
                pools[i] = pools[n - 1];
                pools.pop();
                emit PoolRemoved(pool);
                return;
            }
        }
    }

    function poolsLength() external view returns (uint256) {
        return pools.length;
    }

    // -------- Views --------

    function currentGlobalBps() public view returns (uint256) {
        uint256 nowTs = block.timestamp;
        for (uint256 i = 0; i < phases.length; i++) {
            if (nowTs >= phases[i].start && nowTs < phases[i].end) {
                return phases[i].bps;
            }
        }
        return 0;
    }

    /// @notice BPS share for `pool`, proportional to its stake vs total stake across all registered pools.
    function currentBpsFor(address pool) external view returns (uint256) {
        if (!isPool[pool]) return 0;

        uint256 globalBps = currentGlobalBps();
        if (globalBps == 0) return 0;

        uint256 totalStakeAll;
        uint256 thisStake;

        uint256 n = pools.length;
        for (uint256 i = 0; i < n; i++) {
            uint256 st = IStakingPoolReader(pools[i]).getTotalStakedAcrossPools();
            totalStakeAll += st;
            if (pools[i] == pool) thisStake = st;
        }
        if (totalStakeAll == 0) return 0;

        return (globalBps * thisStake) / totalStakeAll;
    }
}