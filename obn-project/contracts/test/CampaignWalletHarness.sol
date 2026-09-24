// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Test-only contract caller. Tests staking attribution, not CDP/EntryPoint.
contract CampaignWalletHarness {
    address public immutable owner;
    constructor(address owner_) { owner = owner_; }
    function executeBatch(address[] calldata targets, bytes[] calldata data) external {
        require(msg.sender == owner, "owner");
        require(targets.length == data.length, "length");
        for (uint256 i; i < targets.length; ++i) {
            (bool ok, bytes memory result) = targets[i].call(data[i]);
            if (!ok) assembly { revert(add(result, 32), mload(result)) }
        }
    }
}
