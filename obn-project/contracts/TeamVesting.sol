// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TeamVesting
 * @notice Linear vesting contract for team allocation.
 *  - Cliff: 4 months
 *  - Vesting duration: 20 months
 *
 * Helpers:
 *  - claimableNow(): how much can be released right now
 *  - timeUntilCliff(): seconds until cliff (0 if past)
 *  - timeUntilNextRelease(): seconds until next “tick” (daily) during vesting
 *  - nextReleaseTimestamp(): timestamp of that next “tick” (0 if fully vested)
 */
contract TeamVesting is Ownable {
    IERC20 public immutable token;
    address public teamWallet;

    uint256 public immutable start;
    uint256 public constant CLIFF    = 4 * 30 days;   // ~4 months
    uint256 public constant DURATION = 20 * 30 days;  // ~20 months

    // Eventing
    event Released(uint256 amount);
    event TeamWalletUpdated(address indexed oldWallet, address indexed newWallet);

    uint256 public released;

    constructor(
        address tokenAddress,
        address initialTeamWallet,
        uint256 startTimestamp,
        address initialOwner
    ) Ownable(initialOwner) {
        require(tokenAddress != address(0), "Invalid token address");
        require(initialTeamWallet != address(0), "Invalid team wallet");

        token = IERC20(tokenAddress);
        teamWallet = initialTeamWallet;
        start = startTimestamp;
    }

    /// @notice Total vested up to now (balance+released drives allocation)
    function vestedAmount() public view returns (uint256) {
        uint256 totalBalance = token.balanceOf(address(this)) + released;

        uint256 cliffTs = start + CLIFF;
        if (block.timestamp < cliffTs) {
            return 0;
        }

        uint256 elapsed = block.timestamp - cliffTs;
        if (elapsed >= DURATION) {
            return totalBalance;
        }

        return (totalBalance * elapsed) / DURATION;
    }

    /// @notice How much can be released right now (vested - already released)
    function claimableNow() public view returns (uint256) {
        uint256 vested = vestedAmount();
        return vested > released ? vested - released : 0;
    }

    /// @notice Seconds until cliff (0 if already past)
    function timeUntilCliff() external view returns (uint256) {
        uint256 cliffTs = start + CLIFF;
        return block.timestamp >= cliffTs ? 0 : (cliffTs - block.timestamp);
    }

    /**
     * @notice Seconds until the next “release tick” during vesting.
     *         Because vesting is linear (continuous), we define a UI-friendly tick of 1 day.
     *         Returns 0 if before cliff or fully vested.
     */
    function timeUntilNextRelease() external view returns (uint256) {
        uint256 cliffTs = start + CLIFF;
        if (block.timestamp < cliffTs) return 0;

        uint256 elapsed = block.timestamp - cliffTs;
        if (elapsed >= DURATION) return 0;

        uint256 step = 1 days;
        uint256 nextBoundary = ((elapsed / step) + 1) * step;
        if (nextBoundary > DURATION) return 0;

        uint256 nextTs = cliffTs + nextBoundary;
        return nextTs > block.timestamp ? (nextTs - block.timestamp) : 0;
    }

    /**
     * @notice Timestamp of the next daily “tick” during vesting.
     *         Returns 0 if fully vested; returns the cliff timestamp if before cliff.
     */
    function nextReleaseTimestamp() external view returns (uint256) {
        uint256 cliffTs = start + CLIFF;
        if (block.timestamp < cliffTs) return cliffTs;

        uint256 elapsed = block.timestamp - cliffTs;
        if (elapsed >= DURATION) return 0;

        uint256 step = 1 days;
        uint256 nextBoundary = ((elapsed / step) + 1) * step;
        if (nextBoundary > DURATION) return 0;

        return cliffTs + nextBoundary;
    }

    /// @notice Release currently claimable tokens to the team wallet.
    function release() external {
        uint256 vested = vestedAmount();
        uint256 unreleased = vested - released;
        require(unreleased > 0, "Nothing to release");

        // CEI: Effects
        released += unreleased;
        emit Released(unreleased);

        // Interaction
        require(token.transfer(teamWallet, unreleased), "Transfer failed");
    }

    function updateTeamWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");
        address old = teamWallet;
        teamWallet = newWallet;
        emit TeamWalletUpdated(old, newWallet);
    }

    /// @notice Rescue non-vested tokens or any stray ERC20 accidentally sent here (not the vested token).
    function rescueERC20(address erc20, uint256 amount) external onlyOwner {
        require(erc20 != address(token), "Not vested token");
        require(IERC20(erc20).transfer(owner(), amount), "Rescue failed");
    }
}
