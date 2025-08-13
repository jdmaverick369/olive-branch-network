// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IOBNMintable
 * @notice Minimal interface your staking contract needs from the token:
 *         standard ERC20 + a `mint` function.
 */
interface IOBNMintable is IERC20 {
    function mint(address to, uint256 amount) external;
}
