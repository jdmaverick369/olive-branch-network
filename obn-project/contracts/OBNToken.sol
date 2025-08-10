// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";

import { IOBNMintable } from "./StakingPools.sol";

contract OBNToken is
    Initializable,
    IOBNMintable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    mapping(address => bool) public isMinter;
    event MinterUpdated(address indexed minter, bool enabled);

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
        // Base token + Permit + Votes (OZ v5 pattern)
        __ERC20_init("Olive Branch Network", "OBN");
        __ERC20Permit_init("Olive Branch Network");
        __ERC20Votes_init();

        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        // --- sanity checks ---
        require(initialSupply > 0, "supply=0");
        require(liquidityAddress != address(0), "liq=0");
        require(airdropAddress   != address(0), "air=0");
        require(charityAddress   != address(0), "char=0");
        require(treasuryAddress  != address(0), "tre=0");
        require(teamVestingAddress != address(0), "team=0");

        // ===== Updated distribution (sum = 100%) =====
        // 40% airdrop, 30% liquidity, 10% charity, 10% treasury, 10% team
        _mint(airdropAddress,     (initialSupply * 40) / 100);
        _mint(liquidityAddress,   (initialSupply * 30) / 100);
        _mint(charityAddress,     (initialSupply * 10) / 100);
        _mint(treasuryAddress,    (initialSupply * 10) / 100);
        _mint(teamVestingAddress, (initialSupply * 10) / 100);
    }

    modifier onlyMinter() {
        require(isMinter[msg.sender], "Not authorized to mint");
        _;
    }

    function setMinter(address minter, bool enabled) external onlyOwner {
        isMinter[minter] = enabled;
        emit MinterUpdated(minter, enabled);
    }

    function mint(address to, uint256 amount) external override onlyMinter {
        _mint(to, amount);
    }

    // UUPS upgrade gate
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Required OZ v5 overrides ---
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20VotesUpgradeable)
    {
        super._update(from, to, value);
    }

    // rename param to avoid shadowing Ownable.owner()
    function nonces(address account)
        public
        view
        override(ERC20PermitUpgradeable, NoncesUpgradeable)
        returns (uint256)
    {
        return super.nonces(account);
    }

    // Storage gap for future upgrades
    uint256[50] private __gap;
}
