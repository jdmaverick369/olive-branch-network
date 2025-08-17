// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal, forward-friendly interface for NFT integrations.
interface IStakingPools {
    /// Lifetime staking seconds including the current active session (if any).
    function stakeElapsed(address user) external view returns (uint256);

    /// True if the user is currently staked in at least one pool.
    function isGloballyStaked(address user) external view returns (bool);

    /// Timestamp when the current global staking session started (0 if not active).
    function stakedSince(address user) external view returns (uint64);

    /// Lifetime staking seconds accrued excluding the current active session.
    /// (Useful for some UIs; optional for NFT gating. Your pool already exposes this as a public mapping.)
    function cumulativeStakeSeconds(address user) external view returns (uint256);
}
