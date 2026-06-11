// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal mock implementing IExtendOliveBranch for AnnualGovernance tests.
///      Tracks the most recent distribute() / distributeFromGovernance() call.
///      approvedNonprofit is configurable. governance address is configurable for
///      testing the distributeFromGovernance access control.
contract MockExtendOliveBranch {

    mapping(address => bool) private _approved;

    address public governance;

    bool    public distributeCalled;
    address public lastDistributedTo;
    uint256 public lastDistributedAmount;

    bool    public distributeFromGovCalled;
    address public lastFromGovTo;
    uint256 public lastFromGovAmount;

    // ── Setup helpers ──────────────────────────────────────────────────────────

    function setApproved(address nonprofit, bool approved) external {
        _approved[nonprofit] = approved;
    }

    function setGovernance(address gov) external {
        governance = gov;
    }

    // ── Interface implementations ──────────────────────────────────────────────

    function approvedNonprofit(address nonprofit) external view returns (bool) {
        return _approved[nonprofit];
    }

    function distribute(address nonprofit, uint256 amount) external {
        require(_approved[nonprofit], "nonprofit not approved");
        distributeCalled       = true;
        lastDistributedTo      = nonprofit;
        lastDistributedAmount  = amount;
    }

    function distributeFromGovernance(address nonprofit, uint256 amount) external {
        require(msg.sender == governance, "not governance");
        distributeFromGovCalled = true;
        lastFromGovTo           = nonprofit;
        lastFromGovAmount       = amount;
        // intentionally no approvedNonprofit check — mirrors ExtendOliveBranch design
    }
}
