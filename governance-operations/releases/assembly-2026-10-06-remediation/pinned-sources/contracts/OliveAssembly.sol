// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IVaultGovernance {
    function owner() external view returns (address);
    function nftVault() external view returns (address);
    function currentCycleId() external view returns (uint256);
    function getCycleState(uint256 cycleId) external view returns (uint8);
}

/// @title OliveAssembly
/// @notice UUPS custody and historical registration for the existing OliveNFT, owned by Timelock.
/// One active NFT per wallet. No lock period or privileged withdrawal of registered NFTs.
/// Use deposit(): unsolicited safe transfers revert. Plain transferFrom cannot be intercepted;
/// tokens sent that way require owner-reviewed recovery and never acquire voting rights.
contract OliveAssembly is Initializable, IERC721Receiver, ReentrancyGuardUpgradeable, OwnableUpgradeable, UUPSUpgradeable {
    using Checkpoints for Checkpoints.Trace208;

    IERC721 public oliveNFT;
    // OliveNFT IDs start at 1; zero means unregistered.
    mapping(address => uint256) public registeredTokenId;
    mapping(uint256 => address) public depositorOf;
    mapping(address => Checkpoints.Trace208) private _registrations;
    bool private _acceptingDeposit;
    // Start new fields on the original gap boundary (do not pack into the preceding bool).
    uint256 public registrationOpenedAt;
    IVaultGovernance public governance;
    Checkpoints.Trace208 private _registeredCounts;
    uint256[42] private __gap;

    event Registered(address indexed account, uint256 indexed tokenId);
    event Withdrawn(address indexed account, uint256 indexed tokenId, address indexed recipient);
    event GovernanceBound(address indexed governance, uint256 registrationOpenedAt);
    event UnregisteredNFTRecovered(address indexed collection, uint256 indexed tokenId, address indexed recipient, bytes32 transferTxHash);

    error AlreadyRegistered();
    error NotRegistered();
    error NotTokenOwner();
    error InvalidCollection();
    error InvalidRecipient();
    error UnexpectedTransfer();
    error FutureLookup();
    error InvalidGovernance();
    error GovernanceAlreadyBound();
    error CycleInProgress();
    error RegisteredToken();
    error MissingTransferEvidence();
    error RegistrationChanged();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address collection, address timelockOwner) external initializer {
        if (collection.code.length == 0 || !IERC165(collection).supportsInterface(type(IERC721).interfaceId)) {
            revert InvalidCollection();
        }
        oliveNFT = IERC721(collection);
        __ReentrancyGuard_init();
        __Ownable_init(timelockOwner);
        __UUPSUpgradeable_init();
    }

    /// @notice One-time binding after governance's atomic upgrade-and-initialize.
    function bindGovernance(address target) external onlyOwner {
        if (address(governance) != address(0)) revert GovernanceAlreadyBound();
        if (target.code.length == 0) revert InvalidGovernance();
        IVaultGovernance candidate = IVaultGovernance(target);
        if (candidate.owner() != owner() || candidate.nftVault() != address(this)) revert InvalidGovernance();
        _requireIdle(candidate);
        governance = candidate;
        registrationOpenedAt = block.timestamp;
        emit GovernanceBound(target, block.timestamp);
    }

    function _requireIdle(IVaultGovernance target) private view {
        // Fail closed on unavailable/malformed governance reads. States 1-4 are active.
        uint8 state = target.getCycleState(target.currentCycleId());
        if (state != 0 && state != 5 && state != 6) revert CycleInProgress();
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        if (address(governance) != address(0)) _requireIdle(governance);
    }

    /// @notice Timelock must verify the recipient against the cited transfer history.
    /// The hash is an audit reference, not an on-chain proof of the former owner.
    function recoverUnregisteredNFT(address collection, uint256 tokenId, address recipient, bytes32 transferTxHash)
        external onlyOwner nonReentrant
    {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (transferTxHash == bytes32(0)) revert MissingTransferEvidence();
        if (collection == address(oliveNFT) && depositorOf[tokenId] != address(0)) revert RegisteredToken();
        if (IERC721(collection).ownerOf(tokenId) != address(this)) revert NotTokenOwner();
        IERC721(collection).safeTransferFrom(address(this), recipient, tokenId);
        emit UnregisteredNFTRecovered(collection, tokenId, recipient, transferTxHash);
    }

    function deposit(uint256 tokenId) external nonReentrant {
        if (registeredTokenId[msg.sender] != 0) revert AlreadyRegistered();
        if (tokenId == 0 || oliveNFT.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        registeredTokenId[msg.sender] = tokenId;
        depositorOf[tokenId] = msg.sender;
        _registrations[msg.sender].push(SafeCast.toUint48(block.number), 1);
        _registeredCounts.push(SafeCast.toUint48(block.number), _registeredCounts.latest() + 1);
        _acceptingDeposit = true;
        oliveNFT.safeTransferFrom(msg.sender, address(this), tokenId);
        if (_acceptingDeposit || oliveNFT.ownerOf(tokenId) != address(this)) revert UnexpectedTransfer();
        emit Registered(msg.sender, tokenId);
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external returns (bytes4)
    {
        if (msg.sender != address(oliveNFT) || !_acceptingDeposit || operator != address(this)
            || from == address(0) || depositorOf[tokenId] != from || registeredTokenId[from] != tokenId) {
            revert UnexpectedTransfer();
        }
        _acceptingDeposit = false;
        return IERC721Receiver.onERC721Received.selector;
    }

    function withdraw() external nonReentrant { _withdraw(msg.sender); }

    /// @notice Lets a depositing smart wallet choose a receiver if it cannot receive ERC721 safely.
    function withdrawTo(address recipient) external nonReentrant { _withdraw(recipient); }

    /// @notice Atomically binds a withdrawal to the NFT reviewed by the depositor.
    function withdrawExpected(uint256 expectedTokenId, address recipient) external nonReentrant {
        if (expectedTokenId == 0 || registeredTokenId[msg.sender] != expectedTokenId) revert RegistrationChanged();
        _withdraw(recipient);
    }

    /// @notice Registered wallets/NFTs, not a count of wallets meeting the staking minimum.
    function registeredCount() external view returns (uint256) { return _registeredCounts.latest(); }

    function _withdraw(address recipient) private {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        uint256 tokenId = registeredTokenId[msg.sender];
        if (tokenId == 0) revert NotRegistered();
        delete registeredTokenId[msg.sender];
        delete depositorOf[tokenId];
        _registrations[msg.sender].push(SafeCast.toUint48(block.number), 0);
        _registeredCounts.push(SafeCast.toUint48(block.number), _registeredCounts.latest() - 1);
        oliveNFT.safeTransferFrom(address(this), recipient, tokenId);
        emit Withdrawn(msg.sender, tokenId, recipient);
    }

    /// @notice End-of-block registration, independent of current custody. Returns only 0 or 1.
    function getPastRegistration(address account, uint256 blockNumber) external view returns (uint256) {
        if (blockNumber >= block.number) revert FutureLookup();
        return _registrations[account].upperLookupRecent(SafeCast.toUint48(blockNumber));
    }

    function checkpointCount(address account) external view returns (uint256) {
        return _registrations[account].length();
    }

    function getPastRegisteredCount(uint256 blockNumber) external view returns (uint256) {
        if (blockNumber >= block.number) revert FutureLookup();
        return _registeredCounts.upperLookupRecent(SafeCast.toUint48(blockNumber));
    }
}
