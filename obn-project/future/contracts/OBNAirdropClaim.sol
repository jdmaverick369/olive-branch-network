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
 * @notice Signature-based OBN airdrop distributor for Base mainnet.
 *         On claim, tokens are staked directly into a chosen nonprofit pool via StakingPools,
 *         on behalf of the claimant. The nonprofit pool (pid) is selected by the user during
 *         the onboarding flow and is locked into the backend-issued EIP-712 signature.
 *
 * @dev    Security model:
 *         - Non-upgradeable: minimal attack surface for a time-limited distributor.
 *         - EIP-712 typed signatures: the domain (name + version + chainId + verifyingContract)
 *           is embedded in every digest, binding each signature to this specific contract
 *           on this specific chain. Cross-chain and cross-contract replays are impossible.
 *         - hasClaimed[address]: enforces strict one-claim-per-wallet.
 *         - usedDigests[bytes32]: independent replay guard. Ensures the same signed
 *           payload cannot be submitted more than once, even if hasClaimed were bypassed.
 *         - authorizedFunds: tracks only owner-deposited OBN. Tokens sent directly to the
 *           contract address bypass this accounting and cannot be claimed against. The owner
 *           must call fund() to make tokens claimable.
 *         - claimsLive: owner-controlled gate. Claims revert until startClaims() is called.
 *         - approvedPids: owner-managed allowlist of valid staking pool IDs.
 *         - Pause: emergency stop without a contract upgrade.
 *         - emergencyWithdraw: drains authorizedFunds while paused (exploit recovery).
 *         - sweepUntracked: recovers tokens sent directly to the contract (not via fund()).
 *
 *         Campaign lifecycle:
 *           1. Funder calls fund(amount) to deposit OBN and open authorizedFunds.
 *           2. Owner calls approvePid() for each nonprofit pool.
 *           3. Owner calls startClaims() to open the campaign.
 *           4. Campaign runs until authorizedFunds is too low to cover any claim,
 *              or the owner pauses for an emergency.
 *           5. If paused for investigation, owner calls unpause() to resume.
 *              If paused for a genuine exploit, owner calls emergencyWithdraw() to drain.
 *
 *         Eligibility checks (Base App verification, allowlists, etc.) happen offchain.
 *         The contract only validates the cryptographic authorization and pid allowlist.
 *
 *         Staking flow:
 *           1. On claim, this contract approves StakingPools for exactly `amount` tokens.
 *           2. depositFor(pid, amount, recipient) is called — tokens are staked in the
 *              chosen nonprofit pool under the claimant's address.
 *           3. Approval is reset to zero after the deposit to minimise exposure.
 */
contract OBNAirdropClaim is Ownable, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // -------------------------------------------------------------------------
    // Minimal interface — only what this contract calls on StakingPools
    // -------------------------------------------------------------------------

    interface IStakingPoolsDeposit {
        function depositFor(uint256 pid, uint256 amount, address beneficiary) external;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /**
     * @dev EIP-712 typehash for the Claim struct.
     *      Must match exactly what the backend signs, including field order.
     *      Payload: recipient, amount, nonce, pid.
     *      pid is included so the backend locks in the nonprofit the user selected.
     */
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address recipient,uint256 amount,uint256 nonce,uint256 pid)"
    );

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice The OBN token being distributed.
    IERC20 public immutable token;

    /// @notice The StakingPools contract that receives the staked tokens.
    IStakingPoolsDeposit public immutable stakingPools;

    /**
     * @notice The only address permitted to call fund().
     * @dev    Fixed at deployment. Cannot be changed. Separate from the owner role —
     *         ownership transfers do not affect funding rights.
     */
    address public immutable funder;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Backend signer address. Only signatures from this key are accepted.
    address public signer;

    /**
     * @notice Whether the claim campaign is live.
     * @dev    Starts as false. Owner calls startClaims() to open.
     *         There is no automatic end timestamp; the campaign ends when
     *         authorizedFunds can no longer cover a claim, or the owner pauses.
     */
    bool public claimsLive;

    /**
     * @notice Amount of OBN deposited by the owner via fund() and available for claims.
     * @dev    Only incremented by fund(). Decremented by each successful claim.
     *         Tokens transferred directly to this contract address are NOT counted here
     *         and cannot be claimed against — use sweepUntracked() to recover them.
     */
    uint256 public authorizedFunds;

    /// @notice Total number of successful claims so far.
    uint256 public totalClaims;

    /// @notice Tracks which wallets have already claimed. One claim per wallet.
    mapping(address => bool) public hasClaimed;

    /**
     * @notice Tracks EIP-712 digests that have already been consumed.
     * @dev    Independent of hasClaimed. Prevents the same signed payload from
     *         being submitted more than once under any circumstance.
     */
    mapping(bytes32 => bool) public usedDigests;

    /**
     * @notice Allowlist of staking pool IDs that may be used for airdrop claims.
     * @dev    Owner manages this set via approvePid / revokePid.
     *         The backend only issues signatures for pids in this set.
     */
    mapping(uint256 => bool) public approvedPids;

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error ClaimNotStarted();
    error ClaimsAlreadyStarted();
    error AlreadyClaimed();
    error DigestAlreadyUsed();
    error InvalidSignature();
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientAirdropBalance();
    error EmergencyWithdrawNotAllowed();
    error NoUntrackedTokens();
    error NotFunder();
    error CannotSweepAirdropToken();
    error PidNotApproved(uint256 pid);
    error PidAlreadyApproved(uint256 pid);
    error PidNotFound(uint256 pid);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ClaimsStarted();
    event Funded(address indexed from, uint256 amount, uint256 authorizedFunds);
    /// @notice Emitted on every successful claim. pid and nonce included for offchain auditing.
    event Claimed(address indexed recipient, uint256 amount, uint256 nonce, uint256 indexed pid, uint256 totalClaims);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event EmergencyWithdrawn(address indexed to, uint256 amount);
    event UntrackedSwept(address indexed to, uint256 amount);
    event ERC20Recovered(address indexed token_, address indexed to, uint256 amount);
    event PidApproved(uint256 indexed pid);
    event PidRevoked(uint256 indexed pid);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param token_        OBN token address.
     * @param stakingPools_ StakingPools contract address.
     * @param signer_       Initial backend signer address.
     * @param owner_        Initial owner (multisig recommended).
     * @param funder_       Address exclusively permitted to call fund(). Fixed forever.
     */
    constructor(
        address token_,
        address stakingPools_,
        address signer_,
        address owner_,
        address funder_
    )
        Ownable(owner_)
        EIP712("OBNAirdropClaim", "1")
    {
        if (token_        == address(0)) revert ZeroAddress();
        if (stakingPools_ == address(0)) revert ZeroAddress();
        if (signer_       == address(0)) revert ZeroAddress();
        if (owner_        == address(0)) revert ZeroAddress();
        if (funder_       == address(0)) revert ZeroAddress();

        token        = IERC20(token_);
        stakingPools = IStakingPoolsDeposit(stakingPools_);
        signer       = signer_;
        funder       = funder_;
        // claimsLive defaults to false
        // authorizedFunds defaults to 0
    }

    // -------------------------------------------------------------------------
    // Core: Claim
    // -------------------------------------------------------------------------

    /**
     * @notice Claim an airdrop allocation and stake it into a nonprofit pool.
     *
     * @dev    Checks-Effects-Interactions strictly observed.
     *
     *         Replay is prevented by two independent guards:
     *           1. hasClaimed[recipient]  — one claim per wallet address
     *           2. usedDigests[digest]    — one submission per signed payload
     *
     *         The EIP-712 domain ensures no signature is valid on a different chain
     *         or a different contract address. pid is included in the digest so the
     *         backend's nonprofit selection cannot be overridden by the caller.
     *
     *         Staking: this contract approves StakingPools for exactly `amount`,
     *         calls depositFor(pid, amount, recipient), then resets allowance to zero.
     *
     * @param amount     Exact OBN amount in wei as approved by the backend signer.
     * @param nonce      Backend-controlled value that makes each signed payload unique.
     * @param pid        Staking pool ID (nonprofit) selected by the user.
     * @param signature  65-byte EIP-712 signature from the backend signer.
     */
    function claim(
        uint256 amount,
        uint256 nonce,
        uint256 pid,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        // ---- Checks ----

        if (!claimsLive)               revert ClaimNotStarted();
        if (amount == 0)               revert ZeroAmount();
        if (!approvedPids[pid])        revert PidNotApproved(pid);

        address recipient = msg.sender; // never tx.origin
        if (hasClaimed[recipient])     revert AlreadyClaimed();
        if (authorizedFunds < amount)  revert InsufficientAirdropBalance();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, recipient, amount, nonce, pid))
        );

        if (usedDigests[digest])                         revert DigestAlreadyUsed();
        if (ECDSA.recover(digest, signature) != signer)  revert InvalidSignature();

        // ---- Effects ----
        hasClaimed[recipient]  = true;
        usedDigests[digest]    = true;
        authorizedFunds       -= amount;
        totalClaims           += 1;

        // ---- Interactions ----
        // Approve exactly `amount` to StakingPools, deposit on behalf of recipient,
        // then reset allowance to zero to avoid any residual exposure.
        token.forceApprove(address(stakingPools), amount);
        stakingPools.depositFor(pid, amount, recipient);
        token.forceApprove(address(stakingPools), 0);

        emit Claimed(recipient, amount, nonce, pid, totalClaims);
    }

    // -------------------------------------------------------------------------
    // Admin: Funding
    // -------------------------------------------------------------------------

    /**
     * @notice Deposit OBN tokens into the contract and add them to authorizedFunds.
     * @dev    Only callable by the funder address set at deployment (immutable).
     *         Tokens transferred directly to this address are NOT counted —
     *         they must come through this function to be claimable.
     *         Can be called multiple times to top up the campaign.
     * @param amount Amount of OBN to deposit (pulled from funder's wallet).
     */
    function fund(uint256 amount) external {
        if (msg.sender != funder) revert NotFunder();
        if (amount == 0)          revert ZeroAmount();
        authorizedFunds += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount, authorizedFunds);
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
        if (claimsLive)          revert ClaimsAlreadyStarted();
        if (authorizedFunds == 0) revert ZeroAmount();
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
    // Admin: Approved PIDs
    // -------------------------------------------------------------------------

    /**
     * @notice Add a staking pool ID to the approved set.
     * @param pid Pool ID in StakingPools to allow for airdrop staking.
     */
    function approvePid(uint256 pid) external onlyOwner {
        if (approvedPids[pid]) revert PidAlreadyApproved(pid);
        approvedPids[pid] = true;
        emit PidApproved(pid);
    }

    /**
     * @notice Remove a staking pool ID from the approved set.
     * @dev    Does not affect claims already completed to this pid.
     * @param pid Pool ID to revoke.
     */
    function revokePid(uint256 pid) external onlyOwner {
        if (!approvedPids[pid]) revert PidNotFound(pid);
        approvedPids[pid] = false;
        emit PidRevoked(pid);
    }

    // -------------------------------------------------------------------------
    // Admin: Pause
    // -------------------------------------------------------------------------

    /// @notice Pause all claims. Use for investigation or exploit response.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume claims after a resolved incident.
    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // Admin: Fund Recovery
    // -------------------------------------------------------------------------

    /**
     * @notice Emergency drain — recover authorizedFunds while the contract is paused.
     *
     * @dev    Intended for genuine exploit scenarios where funds must be recovered
     *         immediately. Requires the contract to be paused first (deliberate two-step).
     *         A routine investigation pause does NOT accidentally enable a drain —
     *         the owner must call this function explicitly.
     *         authorizedFunds is decremented to reflect the withdrawal.
     *
     *         Pass type(uint256).max to withdraw the full authorized balance.
     *
     * @param to     Destination address.
     * @param amount Amount to withdraw, capped at authorizedFunds.
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        if (!paused())            revert EmergencyWithdrawNotAllowed();
        if (to == address(0))     revert ZeroAddress();
        if (amount == 0)          revert ZeroAmount();
        if (authorizedFunds == 0) revert ZeroAmount();

        uint256 amt = (amount > authorizedFunds) ? authorizedFunds : amount;
        authorizedFunds -= amt;

        token.safeTransfer(to, amt);
        emit EmergencyWithdrawn(to, amt);
    }

    /**
     * @notice Sweep OBN tokens that were sent directly to this contract (not via fund()).
     * @dev    Computes the difference between the raw token balance and authorizedFunds.
     *         Safe to call at any time — it cannot touch authorized campaign funds.
     * @param to Destination address for the untracked tokens.
     */
    function sweepUntracked(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal      = token.balanceOf(address(this));
        uint256 untracked = bal > authorizedFunds ? bal - authorizedFunds : 0;
        if (untracked == 0) revert NoUntrackedTokens();
        token.safeTransfer(to, untracked);
        emit UntrackedSwept(to, untracked);
    }

    /**
     * @notice Recover non-OBN ERC20 tokens accidentally sent to this contract.
     * @dev    The airdrop token cannot be recovered via this path;
     *         use emergencyWithdraw() or sweepUntracked() instead.
     * @param token_  Token to recover.
     * @param to      Destination address.
     * @param amount  Amount to recover.
     */
    function recoverERC20(address token_, address to, uint256 amount) external onlyOwner {
        if (token_ == address(token)) revert CannotSweepAirdropToken();
        if (to == address(0))         revert ZeroAddress();
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
        uint256 nonce,
        uint256 pid
    ) external view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, recipient, amount, nonce, pid))
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
        uint256 nonce,
        uint256 pid
    ) external view returns (bool) {
        return usedDigests[
            _hashTypedDataV4(
                keccak256(abi.encode(CLAIM_TYPEHASH, recipient, amount, nonce, pid))
            )
        ];
    }

    /**
     * @notice Returns the amount of OBN still available for claims.
     * @dev    When this reaches zero the campaign is effectively over.
     *         The backend should stop issuing signatures once this is too low
     *         to cover the standard airdrop amount.
     */
    function remainingFunds() external view returns (uint256) {
        return authorizedFunds;
    }
}
