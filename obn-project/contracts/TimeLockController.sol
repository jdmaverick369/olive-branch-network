// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// import the actual implementation from OpenZeppelin
import "@openzeppelin/contracts/governance/TimelockController.sol";

// ✅ This wrapper doesn’t add anything new, it just gives Hardhat a contract to compile
contract MyTimelockController is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    )
        TimelockController(minDelay, proposers, executors, admin)
    {}
}
