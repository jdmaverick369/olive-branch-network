// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ExtendOliveBranch
/// @notice Receives 1% of OBN staking emissions all year. AnnualGovernance (Phase 2 vote)
///         selects which approved nonprofit receives the accumulated balance each cycle.
///         TimelockOwner can also distribute directly (pre-governance or emergency).
///
/// Non-upgradeable. No ETH handling. No admin functions beyond the two roles below.
///
/// Roles:
///   timelockOwner — immutable. Manages nonprofit whitelist. Sets governance. Emergency sweep.
///                   Can also distribute directly (covers pre-governance phase and emergencies).
///   governance    — mutable (set by timelockOwner). Can distribute to approved nonprofits.
///                   Starts as address(0); wired to AnnualGovernance after deployment.
///
/// Distribution paths:
///   distribute()              — timelockOwner or governance, whitelist enforced.
///   distributeFromGovernance() — AnnualGovernance only, whitelist intentionally omitted.
///                               Recipient was validated against the whitelist at
///                               startAnnualCycle(); a post-vote revocation must not
///                               invalidate a completed community vote. TimelockOwner
///                               retains emergencySweep() as a pre-distribution override.
contract ExtendOliveBranch {
    using SafeERC20 for IERC20;

    IERC20  public immutable obn;
    address public immutable timelockOwner;

    address public governance;
    mapping(address => bool) public approvedNonprofit;

    event Distributed(address indexed nonprofit, uint256 amount);
    event NonprofitApprovalUpdated(address indexed nonprofit, bool approved);
    event GovernanceUpdated(address indexed oldGovernance, address indexed newGovernance);
    event EmergencySweep(address indexed token, address indexed to, uint256 amount);

    modifier onlyTimelockOwner() {
        require(msg.sender == timelockOwner, "not timelockOwner");
        _;
    }

    modifier onlyDistributor() {
        require(
            msg.sender == timelockOwner || msg.sender == governance,
            "not authorized"
        );
        _;
    }

    constructor(address obn_, address timelockOwner_) {
        require(obn_           != address(0), "obn=0");
        require(timelockOwner_ != address(0), "timelock=0");
        obn           = IERC20(obn_);
        timelockOwner = timelockOwner_;
        // governance starts as address(0); timelockOwner wires it via setGovernance()
    }

    // ─── Distribution (timelockOwner or governance) ────────────────────────────

    /// @notice Sends `amount` OBN to `nonprofit`. Nonprofit must be whitelisted.
    ///         Called by timelockOwner or governance for manual distributions (whitelist enforced).
    ///         AnnualGovernance uses distributeFromGovernance() instead (no whitelist check).
    function distribute(address nonprofit, uint256 amount) external onlyDistributor {
        require(approvedNonprofit[nonprofit], "nonprofit not approved");
        require(amount > 0, "amount=0");
        obn.safeTransfer(nonprofit, amount);
        emit Distributed(nonprofit, amount);
    }

    /// @notice Called exclusively by AnnualGovernance after a completed Phase 2 vote.
    ///         The approvedNonprofit check is intentionally omitted — the recipient was
    ///         validated and frozen in the cycle ballot at startAnnualCycle(). Community
    ///         votes are final once Phase 1 has executed; timelockOwner revoking a
    ///         nonprofit's approval after that point must not invalidate the vote result.
    ///         TimelockOwner retains emergencySweep() as a pre-distribution override.
    function distributeFromGovernance(address nonprofit, uint256 amount) external {
        require(msg.sender == governance, "not governance");
        require(nonprofit != address(0), "nonprofit=0");
        require(amount > 0, "amount=0");
        obn.safeTransfer(nonprofit, amount);
        emit Distributed(nonprofit, amount);
    }

    // ─── TimelockOwner admin ────────────────────────────────────────────────────

    /// @notice Adds or removes a nonprofit from the distribution whitelist.
    ///         Should be called for all 11 active pool charity wallets after deployment.
    function setApprovedNonprofit(address nonprofit, bool approved) external onlyTimelockOwner {
        require(nonprofit != address(0), "nonprofit=0");
        approvedNonprofit[nonprofit] = approved;
        emit NonprofitApprovalUpdated(nonprofit, approved);
    }

    /// @notice Wires or updates the governance contract. Pass address(0) to pause governance.
    function setGovernance(address newGovernance) external onlyTimelockOwner {
        emit GovernanceUpdated(governance, newGovernance);
        governance = newGovernance;
    }

    /// @notice Sweeps the full balance of any ERC20 token to `to`.
    ///         `token` is the ERC20 to recover (pass obn address to recover OBN).
    function emergencySweep(address token, address to) external onlyTimelockOwner {
        require(to != address(0), "to=0");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "nothing to sweep");
        IERC20(token).safeTransfer(to, bal);
        emit EmergencySweep(token, to, bal);
    }
}
