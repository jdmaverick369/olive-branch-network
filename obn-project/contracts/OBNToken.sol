// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";

contract OBNToken is
    Initializable,
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
        address treasuryAddress,
        address teamVestingAddress
    ) public initializer {
        // Base token + Permit + Votes (OZ v5 pattern)
        __ERC20_init("Olive Branch Network", "OBN");
        __ERC20Permit_init("Olive Branch Network");
        __ERC20Votes_init();

        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        uint256 liquidityAmount = (initialSupply * 40) / 100;   // 40% to liquidity
        uint256 airdropAmount   = (initialSupply * 40) / 100;   // 40% to airdrop
        uint256 treasuryAmount  = (initialSupply * 10) / 100;   // 10% to treasury
        uint256 teamVestingAmt  = (initialSupply * 10) / 100;   // 10% to team vesting

        _mint(liquidityAddress, liquidityAmount);
        _mint(airdropAddress, airdropAmount);
        _mint(treasuryAddress, treasuryAmount);
        _mint(teamVestingAddress, teamVestingAmt);
    }

    modifier onlyMinter() {
        require(isMinter[msg.sender], "Not authorized to mint");
        _;
    }

    function setMinter(address minter, bool enabled) external onlyOwner {
        isMinter[minter] = enabled;
        emit MinterUpdated(minter, enabled);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    // UUPS upgrade gate
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Required OZ v5 overrides ---

    // ERC20Votes hooks are wired through _update in v5
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20VotesUpgradeable)
    {
        super._update(from, to, value);
    }

    // ERC20Permit + Nonces diamond requires this override in v5
    function nonces(address owner)
        public
        view
        override(ERC20PermitUpgradeable, NoncesUpgradeable)
        returns (uint256)
    {
        return super.nonces(owner);
    }

    // Storage gap for future upgrades
    uint256[50] private __gap;
}