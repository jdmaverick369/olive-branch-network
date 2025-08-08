// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TeamVesting
 * @notice Linear vesting contract for team allocation.
 *  - Cliff: 4 months
 *  - Vesting duration: 20 months
 */
contract TeamVesting is Ownable {
    IERC20 public immutable token;
    address public teamWallet;

    uint256 public immutable start;
    uint256 public constant CLIFF = 4 * 30 days; // ~4 months
    uint256 public constant DURATION = 20 * 30 days; // ~20 months
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

    function vestedAmount() public view returns (uint256) {
        uint256 totalBalance = token.balanceOf(address(this)) + released;

        if (block.timestamp < start + CLIFF) {
            return 0;
        }

        uint256 elapsed = block.timestamp - (start + CLIFF);
        if (elapsed >= DURATION) {
            return totalBalance;
        }

        return (totalBalance * elapsed) / DURATION;
    }

    function release() external {
        uint256 vested = vestedAmount();
        uint256 unreleased = vested - released;
        require(unreleased > 0, "Nothing to release");

        released += unreleased;
        require(token.transfer(teamWallet, unreleased), "Transfer failed");
    }

    function updateTeamWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");
        teamWallet = newWallet;
    }

    /// @notice Rescue non-vested tokens or any stray ERC20 accidentally sent here (not the vested token).
    function rescueERC20(address erc20, uint256 amount) external onlyOwner {
        require(erc20 != address(token), "Not vested token");
        require(IERC20(erc20).transfer(owner(), amount), "Rescue failed");
    }
}