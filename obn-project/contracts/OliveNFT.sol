// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * OliveNFT (OZ v5) — Scatter Mode + One-at-a-time
 *
 * - Max supply: 20,000 (fixed)
 * - Types: N metadata types (e.g., 50). Each type has a count; sum(counts) == MAX_SUPPLY.
 * - Mint price: 0.005 ETH
 * - Commit–reveal with a Feistel-based permutation over 16-bit space to scatter indices,
 *   minimizing streaks while avoiding on-chain RNG and block vars.
 * - tokenURI = baseURI + <typeIndex>.json  (typeIndex is 1..N or "Olive<type>.json")
 * - Unrevealed placeholder supported
 * - One-at-a-time per wallet (toggleable); users can transfer out and mint again.
 */
contract OliveNFT is ERC721Enumerable, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // ---- Config ----
    uint256 public constant MAX_SUPPLY = 20_000;
    uint256 public constant MINT_PRICE = 0.005 ether;

    // ---- Sale / metadata ----
    bool public saleActive;
    bool public revealed;
    string private baseURI_;                  // e.g. ipfs://<metadataCID>[/Olive]
    string public unrevealedURI;              // e.g. ipfs://<placeholderCID>/placeholder.json

    // ---- Types & rarities ----
    // _typeCounts[t] is how many tokens belong to type (t+1). Sum must equal MAX_SUPPLY.
    uint16[] private _typeCounts;
    bool public typeCountsFrozen;

    // ---- Commit–reveal ----
    bytes32 public metadataSeedCommit;        // keccak256(seed)
    bytes32 public metadataSeed;              // revealed seed
    uint256 public metadataOffset;            // kept for transparency (not used by scatter)

    // ---- Mint policy ----
    bool public enforceOnePerAddress = true;  // one-at-a-time per wallet

    // ---- Token IDs ----
    uint256 private _nextTokenId = 1;         // 1-based token IDs

    // ---- Events ----
    event SaleStateSet(bool active);
    event BaseURISet(string baseURI);
    event UnrevealedURISet(string uri);
    event MetadataCommit(bytes32 commitHash);
    event MetadataReveal(bytes32 seed, uint256 offset);
    event TypeCountsSet(uint16[] counts);
    event TypeCountsFrozen();
    event EnforceOnePerAddressSet(bool enforce);
    event Withdraw(address indexed to, uint256 amount);

    // ---- Errors ----
    error SaleNotActive();
    error SoldOut();
    error WrongPrice();
    error AlreadyCommitted();
    error NotCommitted();
    error AlreadyRevealed();
    error InvalidSeed();
    error TypesFrozen();
    error TypesNotSet();
    error BadTypeSum();
    error AlreadyHolding();

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _unrevealedURI
    )
        ERC721(_name, _symbol)
        Ownable(msg.sender) // OZ v5 requires initial owner
    {
        unrevealedURI = _unrevealedURI;
    }

    // --- Admin ---

    function setSaleActive(bool _active) external onlyOwner {
        saleActive = _active;
        emit SaleStateSet(_active);
    }

    function setEnforceOnePerAddress(bool v) external onlyOwner {
        enforceOnePerAddress = v;
        emit EnforceOnePerAddressSet(v);
    }

    /// @notice Define the exact counts per type (must sum to MAX_SUPPLY). Callable until frozen.
    function setTypeCounts(uint16[] calldata counts) external onlyOwner {
        if (typeCountsFrozen) revert TypesFrozen();

        uint256 sum = 0;
        for (uint256 i = 0; i < counts.length; ++i) {
            sum += counts[i];
        }
        if (sum != MAX_SUPPLY) revert BadTypeSum();

        delete _typeCounts;
        _typeCounts = counts;
        emit TypeCountsSet(counts);
    }

    /// @notice Prevent further changes to type counts (recommended before/at reveal).
    function freezeTypeCounts() external onlyOwner {
        typeCountsFrozen = true;
        emit TypeCountsFrozen();
    }

    /// @notice Commit the hash of your secret seed BEFORE reveal.
    function commitMetadataSeed(bytes32 commitHash) external onlyOwner {
        if (metadataSeedCommit != bytes32(0)) revert AlreadyCommitted();
        metadataSeedCommit = commitHash;
        emit MetadataCommit(commitHash);
    }

    /// @notice Reveal by providing the preimage; seeds the permutation and sets baseURI.
    function revealMetadata(bytes32 seed, string calldata newBaseURI) external onlyOwner {
        if (_typeCounts.length == 0) revert TypesNotSet();
        if (metadataSeedCommit == bytes32(0)) revert NotCommitted();
        if (revealed) revert AlreadyRevealed();
        if (keccak256(abi.encodePacked(seed)) != metadataSeedCommit) revert InvalidSeed();

        metadataSeed = seed;

        // Keep computing a legacy offset for transparency (not used by scatter)
        metadataOffset = uint256(keccak256(abi.encode(seed, address(this)))) % MAX_SUPPLY;

        revealed = true;
        _setBaseURI(newBaseURI);
        emit MetadataReveal(seed, metadataOffset);
    }

    function setUnrevealedURI(string calldata uri) external onlyOwner {
        unrevealedURI = uri;
        emit UnrevealedURISet(uri);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        _setBaseURI(uri);
    }

    function _setBaseURI(string calldata uri) internal {
        baseURI_ = uri;
        emit BaseURISet(uri);
    }

    // --- Minting ---

    /// @notice Mint exactly ONE token per tx (keeps gas & audit surface small).
    function mint() external payable nonReentrant {
        if (!saleActive) revert SaleNotActive();
        if (totalSupply() >= MAX_SUPPLY) revert SoldOut();
        if (msg.value != MINT_PRICE) revert WrongPrice();

        // One-at-a-time per wallet (they can transfer out and mint again)
        if (enforceOnePerAddress && balanceOf(msg.sender) != 0) revert AlreadyHolding();

        _safeMint(msg.sender, _nextTokenId);
        unchecked { _nextTokenId += 1; }
    }

    /// @notice Owner reserve mint (airdrop/ops); still respects MAX_SUPPLY.
    function ownerMint(address to, uint256 quantity) external onlyOwner {
        uint256 supply = totalSupply();
        require(supply + quantity <= MAX_SUPPLY, "Exceeds max");

        uint256 tokenId = _nextTokenId;
        unchecked {
            for (uint256 i = 0; i < quantity; ++i) {
                _safeMint(to, tokenId++);
            }
            _nextTokenId = tokenId;
        }
    }

    // --- Scatter permutation (Feistel over 16-bit, cycle-walk to < MAX_SUPPLY) ---

    /// @dev 8-bit round function for Feistel; returns value in [0..255].
    function _F8(uint16 r, uint256 round) internal view returns (uint16) {
        return uint16(uint256(keccak256(abi.encode(metadataSeed, round, r))) & 0xFF);
    }

    /// @dev 16-bit Feistel permutation with 4 rounds over [0..65535] using 8-bit halves.
    function _feistel16(uint16 x) internal view returns (uint16) {
        uint16 L = x >> 8;       // upper 8 bits
        uint16 R = x & 0xFF;     // lower 8 bits
        unchecked {
            for (uint256 round = 0; round < 4; ++round) {
                uint16 newL = R;
                uint16 newR = L ^ _F8(R, round);
                L = newL & 0xFF;
                R = newR & 0xFF;
            }
        }
        return (L << 8) | R;     // still in [0..65535]
    }

    /// @dev Scatter map: start from v in [0..MAX_SUPPLY-1], walk permutation until it lands < MAX_SUPPLY.
    function _scatterIndex(uint256 v) internal view returns (uint256) {
        uint16 x = uint16(v);           // MAX_SUPPLY=20,000 < 2^16
        uint16 y = _feistel16(x);
        // Cycle-walk within the permutation's cycle until we fall below MAX_SUPPLY
        // (guaranteed to terminate since MAX_SUPPLY < 2^16 and cycles are finite).
        while (y >= MAX_SUPPLY) {
            y = _feistel16(y);
        }
        return uint256(y); // 0-based
    }

    // --- Metadata ---

    /// @notice Returns the metadata type index (1..N) for a given tokenId (post-reveal).
    function tokenType(uint256 tokenId) public view returns (uint256) {
        _requireOwned(tokenId);
        if (!revealed) return 0; // 0 = unknown pre-reveal

        // Scatter: tokenId (1-based) -> permuted global index in [0..MAX_SUPPLY-1]
        uint256 gidx0 = _scatterIndex(tokenId - 1);
        uint256 gidx1 = gidx0 + 1; // 1..MAX_SUPPLY

        // Walk cumulative counts to find the type bucket.
        uint256 running = 0;
        uint256 n = _typeCounts.length;
        for (uint256 t = 0; t < n; ++t) {
            running += _typeCounts[t];
            if (gidx1 <= running) {
                return t + 1; // 1-based type index to match filenames 1.json..N.json (or Olive1..)
            }
        }
        return 0; // unreachable if counts sum correctly
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!revealed) return unrevealedURI;

        uint256 tIndex = tokenType(tokenId); // 1..N
        require(tIndex != 0, "type not found");

        // Avoid abi.encodePacked(dynamic,dynamic) to satisfy Slither
        return string.concat(baseURI_, tIndex.toString(), ".json");
    }

    /// @notice Expose counts for UI/off-chain tools.
    function getTypeCounts() external view returns (uint16[] memory) {
        return _typeCounts;
    }

    // --- Withdraw ---

    function withdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "zero address");
        uint256 bal = address(this).balance;
        emit Withdraw(to, bal);          // emit before external call
        Address.sendValue(to, bal);      // safe send (reverts on failure)
    }

    // --- Friendly reverts on accidental ETH transfers ---

    receive() external payable { revert("send ETH via mint()"); }
    fallback() external payable { revert("send ETH via mint()"); }
}