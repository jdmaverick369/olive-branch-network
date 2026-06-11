// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal mock implementing IStakingPoolsForGovernance for AnnualGovernance tests.
///      All state is configurable. Voting power is returned flat (ignores blockNumber)
///      because the checkpoint mechanism is tested separately in StakingPoolsV93 tests.
contract MockStakingForGovernance {

    // poolLength() getter satisfies the interface function of the same name.
    uint256 public poolLength;

    // poolFullyRemoved(pid) getter satisfies the interface function of the same name.
    mapping(uint256 => bool) public poolFullyRemoved;

    mapping(uint256 => address) private _poolWallets;
    mapping(address => uint256) private _votingPower;

    // By default users are considered already-initialized (checkpointCount returns 1).
    // Set _uninitialized[user] = true to simulate a pre-upgrade staker needing bootstrap.
    mapping(address => bool) private _uninitialized;

    // ── Setup helpers ──────────────────────────────────────────────────────────

    function setPoolCount(uint256 n) external { poolLength = n; }

    function setPool(uint256 pid, address wallet) external { _poolWallets[pid] = wallet; }

    function setPoolFullyRemoved(uint256 pid, bool removed) external {
        poolFullyRemoved[pid] = removed;
    }

    function setVotingPower(address user, uint256 power) external {
        _votingPower[user] = power;
    }

    /// @dev Mark a user as having no checkpoint (simulates pre-upgrade staker).
    function setUninitialized(address user, bool value) external {
        _uninitialized[user] = value;
    }

    // ── Interface implementations ──────────────────────────────────────────────

    function getPoolInfo(uint256 pid)
        external
        view
        returns (address charityWallet, uint256 totalStaked)
    {
        return (_poolWallets[pid], 0);
    }

    function getPastVotingPower(address user, uint256 /*blockNumber*/)
        external
        view
        returns (uint256)
    {
        return _votingPower[user];
    }

    /// @dev Returns 0 if marked uninitialized, otherwise 1 (already bootstrapped).
    function checkpointCount(address user) external view returns (uint256) {
        return _uninitialized[user] ? 0 : 1;
    }

    /// @dev Simulates bootstrap: clears the uninitialized flag.
    function bootstrapCheckpoint(address user) external {
        require(_uninitialized[user], "already initialized");
        _uninitialized[user] = false;
    }
}
