// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IEmissionsController } from "./StakingPools.sol";

/**
 * @title EmissionsController (Global APY)
 * @notice Immutable deflation schedule. Each registered StakingPools contract receives the
 *         SAME currentGlobalBps(), so per-token APR is equal across all managers when
 *         StakingPools computes:
 *           rewards/sec = (globalTotalStaked * poolBps) / 10000 / 365 days
 *
 * Phases (relative to `start` passed in constructor):
 *  - [start, start+2y)       : 1000 bps  (10%)
 *  - [start+2y, start+4y)    : 750  bps  (7.5%)
 *  - [start+4y, start+6y)    : 500  bps  (5%)
 *  - [start+6y, start+8y)    : 250  bps  (2.5%)
 *  - [start+8y, start+10y)   : 125  bps  (1.25%)
 */
contract EmissionsController is IEmissionsController {
    struct Phase { uint256 start; uint256 end; uint256 bps; }

    address public owner; // registry admin (optional to renounce later)
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

        // Hard-coded deflation schedule (global)
        phases.push(Phase(start,             start + 2*year, 1000)); // 10%
        phases.push(Phase(start + 2*year,    start + 4*year,  750)); // 7.5%
        phases.push(Phase(start + 4*year,    start + 6*year,  500)); // 5%
        phases.push(Phase(start + 6*year,    start + 8*year,  250)); // 2.5%
        phases.push(Phase(start + 8*year,    start +10*year,  125)); // 1.25%
    }

    // -------- Registry admin --------

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

        uint256 len = pools.length;
        uint256 found = type(uint256).max;

        for (uint256 i = 0; i < len; ++i) {
            if (pools[i] == pool) {
                found = i;
                break;
            }
        }
        require(found != type(uint256).max, "desync");

        uint256 last = len - 1;
        if (found != last) {
            pools[found] = pools[last];
        }
        pools.pop();

        emit PoolRemoved(pool);
    }

    function poolsLength() external view returns (uint256) {
        return pools.length;
    }

    // -------- Views --------

    function currentGlobalBps() public view returns (uint256) {
        uint256 nowTs = block.timestamp;
        uint256 len = phases.length;
        for (uint256 i = 0; i < len; ++i) {
            Phase memory p = phases[i];
            if (nowTs >= p.start && nowTs < p.end) {
                return p.bps;
            }
        }
        return 0;
    }

    /**
     * @notice SAME BPS for every registered StakingPools manager.
     *         Satisfies IEmissionsController.
     */
    function currentBpsFor(address pool) external view override returns (uint256) {
        return isPool[pool] ? currentGlobalBps() : 0;
    }
}
