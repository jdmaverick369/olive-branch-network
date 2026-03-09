// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title  OBNAirdropClaim
 * @notice Signature-based, one-claim-per-wallet OBN airdrop distributor for Base mainnet.
 *
 * @dev    Security model:
 *         - Non-upgradeable: minimal attack surface for a time-limited distributor.
 *         - EIP-712 typed signatures: the domain (name + version + chainId + verifyingContract)
 *           is embedded in every digest, binding each signature to this specific contract
 *           on this specific chain. Cross-chain and cross-contract replays are impossible.
 *         - hasClaimed[address]: enforces strict one-claim-per-wallet.
 *         - usedDigests[bytes32]: independent replay guard. Ensures the same signed
 *           payload cannot be submitted more than once, even if hasClaimed were bypassed.
 *         - maxClaims: hard cap on total unique claimants. Campaign ends when this is reached.
 *         - claimsLive: owner-controlled gate. Claims revert until startClaims() is called.
 *         - Pause: emergency stop without a contract upgrade.
 *         - withdrawAirdropTokens: restricted to while paused OR after maxClaims is reached.
 *
 *         Eligibility checks (social requirements, allowlists, etc.) happen offchain.
 *         The contract only validates the cryptographic authorization.
 */
contract OBNAirdropClaim is Ownable, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /**
     * @dev EIP-712 typehash for the Claim struct.
     *      Must match exactly what the backend signs, including field order.
     *      Payload: recipient, amount, nonce.
     */
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address recipient,uint256 amount,uint256 nonce)"
    );

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice The OBN token being distributed.
    IERC20 public immutable token;

    /**
     * @notice Maximum number of unique wallets that may claim.
     * @dev    The campaign ends when totalClaims reaches this value.
     *         Set to type(uint256).max at deployment to disable the cap.
     */
    uint256 public immutable maxClaims;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Backend signer address. Only signatures from this key are accepted.
    address public signer;

    /**
     * @notice Whether the claim campaign is live.
     * @dev    Starts as false. Owner calls startClaims() to open.
     *         There is no automatic end timestamp; the campaign ends when
     *         totalClaims reaches maxClaims, or the owner pauses.
     */
    bool public claimsLive;

    /// @notice Tracks which wallets have already claimed. One claim per wallet.
    mapping(address => bool) public hasClaimed;

    /**
     * @notice Tracks EIP-712 digests that have already been consumed.
     * @dev    Independent of hasClaimed. Prevents the same signed payload from
     *         being submitted more than once under any circumstance.
     */
    mapping(bytes32 => bool) public usedDigests;

    /// @notice Total number of successful claims so far.
    uint256 public totalClaims;

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error ClaimNotStarted();
    error ClaimsAlreadyStarted();
    error AlreadyClaimed();
    error DigestAlreadyUsed();
    error MaxClaimsReached();
    error InvalidSignature();
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientAirdropBalance();
    error WithdrawNotAllowed();
    error CannotSweepAirdropToken();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ClaimsStarted();
    /// @notice Emitted on every successful claim. Nonce included for offchain auditing.
    event Claimed(address indexed recipient, uint256 amount, uint256 nonce, uint256 totalClaims);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event AirdropTokensWithdrawn(address indexed to, uint256 amount);
    event ERC20Recovered(address indexed token_, address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param token_      OBN token address.
     * @param signer_     Initial backend signer address.
     * @param owner_      Initial owner (multisig recommended).
     * @param maxClaims_  Maximum unique claimants. Use type(uint256).max to disable.
     */
    constructor(
        address token_,
        address signer_,
        address owner_,
        uint256 maxClaims_
    )
        Ownable(owner_)
        EIP712("OBNAirdropClaim", "1")
    {
        if (token_     == address(0)) revert ZeroAddress();
        if (signer_    == address(0)) revert ZeroAddress();
        if (owner_     == address(0)) revert ZeroAddress();
        if (maxClaims_ == 0)          revert ZeroAmount();

        token     = IERC20(token_);
        signer    = signer_;
        maxClaims = maxClaims_;
        // claimsLive defaults to false
    }

    // -------------------------------------------------------------------------
    // Core: Claim
    // -------------------------------------------------------------------------

    /**
     * @notice Claim an airdrop allocation.
     *
     * @dev    Checks-Effects-Interactions strictly observed.
     *
     *         Replay is prevented by three independent guards:
     *           1. hasClaimed[recipient]  — one claim per wallet address
     *           2. usedDigests[digest]    — one submission per signed payload
     *           3. maxClaims              — hard cap on total unique claimants
     *
     *         The EIP-712 domain ensures no signature is valid on a different chain
     *         or a different contract address.
     *
     * @param amount     Exact OBN amount in wei as approved by the backend signer.
     * @param nonce      Backend-controlled value that makes each signed payload unique.
     * @param signature  65-byte EIP-712 signature from the backend signer.
     */
    function claim(
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        // ---- Checks ----

        if (!claimsLive)               revert ClaimNotStarted();
        if (amount == 0)               revert ZeroAmount();

        address recipient = msg.sender; // never tx.origin
        if (hasClaimed[recipient])     revert AlreadyClaimed();
        if (totalClaims >= maxClaims)  revert MaxClaimsReached();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, recipient, amount, nonce))
        );

        if (usedDigests[digest])                         revert DigestAlreadyUsed();
        if (ECDSA.recover(digest, signature) != signer)  revert InvalidSignature();
        if (token.balanceOf(address(this)) < amount)     revert InsufficientAirdropBalance();

        // ---- Effects ----
        hasClaimed[recipient] = true;
        usedDigests[digest]   = true;
        totalClaims          += 1;

        // ---- Interactions ----
        token.safeTransfer(recipient, amount);

        emit Claimed(recipient, amount, nonce, totalClaims);
    }

    // -------------------------------------------------------------------------
    // Admin: Campaign Control
    // -------------------------------------------------------------------------

    /**
     * @notice Open the claim campaign. Irreversible — use pause() to halt after starting.
     * @dev    Intentionally one-way. The owner cannot un-start a campaign;
     *         pause() handles emergencies after launch.
     */
    function startClaims() external onlyOwner {
        if (claimsLive) revert ClaimsAlreadyStarted();
        claimsLive = true;
        emit ClaimsStarted();
    }

    /**
     * @notice Rotate the backend signer key.
     * @param newSigner New signer address. Cannot be zero.
     */
    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit SignerUpdated(signer, newSigner);
        signer = newSigner;
    }

    // -------------------------------------------------------------------------
    // Admin: Pause
    // -------------------------------------------------------------------------

    /// @notice Pause all claims.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume claims.
    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // Admin: Fund Recovery
    // -------------------------------------------------------------------------

    /**
     * @notice Withdraw remaining OBN tokens from the contract.
     *
     * @dev    Only callable while the contract is paused (emergency) OR after
     *         totalClaims has reached maxClaims (campaign complete). Cannot be
     *         called during an active campaign to protect unclaimed allocations.
     *
     *         Pass type(uint256).max to withdraw the full available balance.
     *
     * @param to     Destination address.
     * @param amount Amount to withdraw, capped at the available balance.
     */
    function withdrawAirdropTokens(address to, uint256 amount) external onlyOwner {
        if (!paused() && totalClaims < maxClaims) revert WithdrawNotAllowed();
        if (to == address(0)) revert ZeroAddress();

        uint256 bal = token.balanceOf(address(this));
        uint256 amt = (amount > bal) ? bal : amount;
        if (amt == 0) revert ZeroAmount();

        token.safeTransfer(to, amt);
        emit AirdropTokensWithdrawn(to, amt);
    }

    /**
     * @notice Recover ERC20 tokens accidentally sent to this contract.
     * @dev    The airdrop token cannot be recovered via this path; use withdrawAirdropTokens.
     * @param token_  Token to recover.
     * @param to      Destination address.
     * @param amount  Amount to recover.
     */
    function recoverERC20(address token_, address to, uint256 amount) external onlyOwner {
        if (token_ == address(token)) revert CannotSweepAirdropToken();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token_).safeTransfer(to, amount);
        emit ERC20Recovered(token_, to, amount);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns the EIP-712 domain separator for offchain tooling.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Returns the digest that the backend must sign for a given payload.
     * @dev    Computes the same digest as claim() for integration and testing use.
     */
    function getClaimDigest(
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, recipient, amount, nonce))
        );
    }

    /**
     * @notice Returns whether a specific claim payload has already been consumed.
     * @dev    Useful for offchain status checks and UI visibility before submission.
     *         Computes the digest identically to claim().
     */
    function isClaimDigestUsed(
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external view returns (bool) {
        return usedDigests[
            _hashTypedDataV4(
                keccak256(abi.encode(CLAIM_TYPEHASH, recipient, amount, nonce))
            )
        ];
    }

    /**
     * @notice Returns remaining claimant slots before the cap is reached.
     * @dev    Returns 0 if the cap has been reached.
     */
    function remainingClaims() external view returns (uint256) {
        if (totalClaims >= maxClaims) return 0;
        return maxClaims - totalClaims;
    }
}
