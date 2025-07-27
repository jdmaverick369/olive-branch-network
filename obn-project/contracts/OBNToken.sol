// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

contract OBNToken is Initializable, ERC20VotesUpgradeable, OwnableUpgradeable, UUPSUpgradeable {
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
        // Initializing ERC20 and Ownable
        __ERC20_init("Olive Branch Network", "OBN");
        __EIP712_init("Olive Branch Network", "1");
        __ERC20Votes_init();
        __Ownable_init(initialOwner);  // Proper initialization of OwnableUpgradeable with the owner address
        __UUPSUpgradeable_init();

        uint256 liquidityAmount = initialSupply * 40 / 100;   // 40% to liquidity
        uint256 airdropAmount = initialSupply * 40 / 100;      // 40% to airdrop
        uint256 treasuryAmount = initialSupply * 10 / 100;     // 10% to treasury
        uint256 teamVestingAmount = initialSupply * 10 / 100;  // 10% to team vesting

        // Mint tokens for the specified addresses
        _mint(liquidityAddress, liquidityAmount);
        _mint(airdropAddress, airdropAmount);
        _mint(treasuryAddress, treasuryAmount);
        _mint(teamVestingAddress, teamVestingAmount);
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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}