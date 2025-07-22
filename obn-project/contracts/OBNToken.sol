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

    function initialize(address initialOwner, uint256 initialSupply) public initializer {
        __ERC20_init("Olive Branch Network", "OBN");
        __EIP712_init("Olive Branch Network", "1"); // ✅ required parent initializer
        __ERC20Votes_init();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();

        _mint(initialOwner, initialSupply);
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

    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20VotesUpgradeable)
    {
        super._update(from, to, amount);
    }
}