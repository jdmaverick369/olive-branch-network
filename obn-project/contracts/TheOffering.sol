// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Minimal extension of IERC20 to call burn() on OBNToken (ERC20Burnable).
interface IOBN is IERC20 {
    function burn(uint256 amount) external;
}

/// @title TheOffering
/// @notice Receives 1% of OBN staking emissions all year. AnnualGovernance decides each cycle
///         whether the accumulated balance is burned or sent to ExtendOliveBranch.
///
/// Non-upgradeable. No ETH handling. No admin functions beyond the two roles below.
///
/// Roles:
///   timelockOwner — immutable. Sets governance address. Emergency sweep.
///   governance    — mutable (set by timelockOwner). Calls burn() or sendToExtend().
///
/// Deployment order: deploy ExtendOliveBranch first, then pass its address here.
/// Governance starts as address(0) and is wired later via setGovernance(AnnualGovernance).
contract TheOffering {
    using SafeERC20 for IERC20;

    IOBN    public immutable obn;
    address public immutable extendOliveBranch;
    address public immutable timelockOwner;

    address public governance;

    event Burned(uint256 amount);
    event SentToExtend(uint256 amount);
    event GovernanceUpdated(address indexed oldGovernance, address indexed newGovernance);
    event EmergencySweep(address indexed token, address indexed to, uint256 amount);

    modifier onlyTimelockOwner() {
        require(msg.sender == timelockOwner, "not timelockOwner");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "not governance");
        _;
    }

    constructor(address obn_, address extendOliveBranch_, address timelockOwner_) {
        require(obn_               != address(0), "obn=0");
        require(extendOliveBranch_ != address(0), "extend=0");
        require(timelockOwner_     != address(0), "timelock=0");
        obn               = IOBN(obn_);
        extendOliveBranch = extendOliveBranch_;
        timelockOwner     = timelockOwner_;
        // governance starts as address(0); timelockOwner wires it via setGovernance()
    }

    // ─── Governance actions (called by AnnualGovernance after Phase 1 vote) ────

    /// @notice Burns the full TheOffering OBN balance. Called after a BURN vote.
    function burn(uint256 amount) external onlyGovernance {
        require(amount > 0, "amount=0");
        obn.burn(amount);
        emit Burned(amount);
    }

    /// @notice Sends OBN to ExtendOliveBranch. Called after a GIVE vote.
    function sendToExtend(uint256 amount) external onlyGovernance {
        require(amount > 0, "amount=0");
        IERC20(address(obn)).safeTransfer(extendOliveBranch, amount);
        emit SentToExtend(amount);
    }

    // ─── TimelockOwner admin ────────────────────────────────────────────────────

    /// @notice Wires or updates the governance contract. Pass address(0) to pause governance.
    function setGovernance(address newGovernance) external onlyTimelockOwner {
        emit GovernanceUpdated(governance, newGovernance);
        governance = newGovernance;
    }

    /// @notice Sweeps the full balance of any ERC20 token to `to`.
    ///         `token` is the ERC20 to recover (pass obn address to recover OBN).
    function emergencySweep(address token, address to) external onlyTimelockOwner {
        require(token != address(0), "token=0");
        require(to != address(0), "to=0");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "nothing to sweep");
        IERC20(token).safeTransfer(to, bal);
        emit EmergencySweep(token, to, bal);
    }
}
