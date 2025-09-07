// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";

import { IOBNMintable } from "./interfaces/IOBNMintable.sol";

/**
 * @title OBNToken
 * @notice ERC20 + Burn + Permit + Votes (upgradeable).
 *         - Initial supply is distributed once in initialize.
 *         - A single minter (staking contract) is set exactly once.
 */
contract OBNToken is
    Initializable,
    IOBNMintable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    ERC20BurnableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    /// @notice Address allowed to mint staking rewards. Set exactly once.
    address public minter;

    event MinterSet(address indexed minter);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        uint256 initialSupply,
        address liquidityAddress,
        address airdropAddress,
        address charityAddress,
        address treasuryAddress,
        address teamVestingAddress
    ) public initializer {
        // Base token + Permit + Votes + Burnable (OZ v5 pattern)
        __ERC20_init("Olive Branch Network", "OBN");
        __ERC20Permit_init("Olive Branch Network");
        __ERC20Votes_init();
        __ERC20Burnable_init();

        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        // --- sanity checks ---
        require(initialSupply > 0, "supply=0");
        require(liquidityAddress != address(0), "liq=0");
        require(airdropAddress   != address(0), "air=0");
        require(charityAddress   != address(0), "char=0");
        require(treasuryAddress  != address(0), "tre=0");
        require(teamVestingAddress != address(0), "team=0");

        // ===== Distribution (sum = 100%) =====
        // 30% airdrop, 40% liquidity, 10% charity, 10% treasury, 10% team
        _mint(airdropAddress,     (initialSupply * 30) / 100);
        _mint(liquidityAddress,   (initialSupply * 40) / 100);
        _mint(charityAddress,     (initialSupply * 10) / 100);
        _mint(treasuryAddress,    (initialSupply * 10) / 100);
        _mint(teamVestingAddress, (initialSupply * 10) / 100);
    }

    // ------------------------------------------------------------------------
    // One-time minter setup
    // ------------------------------------------------------------------------

    /**
     * @notice Set the staking contract as the sole minter. Can only be called once.
     *         After this, no other minter can be set unless the contract is upgraded.
     */
    function setMinterOnce(address minterAddr) external onlyOwner {
        require(minter == address(0), "minter already set");
        require(minterAddr != address(0), "minter=0");
        minter = minterAddr;
        emit MinterSet(minterAddr);
    }

    /// @notice Convenience helper for integrations / sanity checks.
    function isMinter(address account) external view returns (bool) {
        return account == minter;
    }

    /**
     * @notice Mint function used by the staking contract to distribute rewards.
     *         Only the sole minter can call this.
     */
    function mint(address to, uint256 amount) external override {
        require(msg.sender == minter, "not minter");
        _mint(to, amount);
    }

    // ------------------------------------------------------------------------
    // UUPS upgrade gate
    // ------------------------------------------------------------------------
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ------------------------------------------------------------------------
    // Required OZ v5 overrides
    // ------------------------------------------------------------------------
    // ERC20Votes hooks everything through _update(), so this single override is enough.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20VotesUpgradeable)
    {
        super._update(from, to, value);
    }

    // Required because ERC20PermitUpgradeable and NoncesUpgradeable both implement nonces()
    function nonces(address account)
        public
        view
        override(ERC20PermitUpgradeable, NoncesUpgradeable)
        returns (uint256)
    {
        return super.nonces(account);
    }

    // Storage gap for future upgrades
    uint256[100] private __gap;
}