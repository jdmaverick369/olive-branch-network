// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal mock implementing ITheOffering for AnnualGovernance tests.
///      Tracks whether burn/sendToExtend was called and with what amount.
///      Can be configured to revert to test EVM atomicity guarantees.
contract MockTheOffering {

    bool public burnCalled;
    bool public sendToExtendCalled;
    uint256 public lastAmount;

    bool public shouldRevertOnBurn;
    bool public shouldRevertOnSend;

    // ── Setup helpers ──────────────────────────────────────────────────────────

    function setShouldRevertOnBurn(bool val) external { shouldRevertOnBurn = val; }
    function setShouldRevertOnSend(bool val) external { shouldRevertOnSend = val; }

    function reset() external {
        burnCalled        = false;
        sendToExtendCalled = false;
        lastAmount        = 0;
        shouldRevertOnBurn = false;
        shouldRevertOnSend = false;
    }

    // ── Interface implementations ──────────────────────────────────────────────

    function burn(uint256 amount) external {
        require(!shouldRevertOnBurn, "MockTheOffering: burn reverted");
        burnCalled = true;
        lastAmount = amount;
    }

    function sendToExtend(uint256 amount) external {
        require(!shouldRevertOnSend, "MockTheOffering: sendToExtend reverted");
        sendToExtendCalled = true;
        lastAmount = amount;
    }
}
