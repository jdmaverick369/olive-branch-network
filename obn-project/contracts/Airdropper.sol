// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract OBNAirdropper {
    IERC20 public immutable token;

    constructor(address _token) {
        require(_token != address(0), "Invalid token address");
        token = IERC20(_token);
    }

    function batchAirdrop(address[] calldata recipients, uint256[] calldata amounts) external {
        uint256 len = recipients.length;
        require(len == amounts.length, "Mismatched input lengths");
        for (uint256 i = 0; i < len; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Invalid amount");
            bool success = token.transferFrom(msg.sender, recipients[i], amounts[i]);
            require(success, "Transfer failed");
        }
    }
}
