// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @notice Wallet consent and calendar-month limits for a dedicated claim executor.
/// @dev Separate from identity and voting. No token approvals or reward destinations
/// are controlled by the executor. ERC-7201 storage preserves the V9.3/V9.4 gaps.
abstract contract MonthlyAutoClaimUpgradeable is ReentrancyGuardUpgradeable, OwnableUpgradeable {

    /// @custom:storage-location erc7201:obn.storage.MonthlyAutoClaim
    struct AutoClaimStorage {
        address executor;
        mapping(address => bool) enabled;
        mapping(address => uint256) consentNonce;
        mapping(uint256 => mapping(address => uint256)) lastMonth;
    }

    // keccak256(abi.encode(uint256(keccak256("obn.storage.MonthlyAutoClaim")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant AUTO_CLAIM_STORAGE =
        0xc6b51576401e3082bd2c422154b886102daceff435e21128d4554e98c947de00;

    error NotAutoClaimExecutor();
    error AutoClaimDisabled();
    error StaleConsent();
    error WrongMonth();
    error InvalidAutoClaimPools();
    error NoClaimableRewards();
    error PreferenceUnchanged();
    error AutoClaimUnavailable();
    error NotStaker();

    event AutoClaimExecutorChanged(address indexed previousExecutor, address indexed executor);
    event AutoClaimPreferenceChanged(address indexed user, bool enabled, uint256 consentNonce);
    event MonthlyAutoClaimed(address indexed user, uint256 indexed pid, uint256 indexed month, uint256 amount);

    function _autoClaimStorage() private pure returns (AutoClaimStorage storage s) {
        assembly { s.slot := AUTO_CLAIM_STORAGE }
    }

    /// @notice Zero disables automation globally; existing user preferences persist.
    function setAutoClaimExecutor(address executor) external onlyOwner {
        _setAutoClaimExecutor(executor);
    }

    function _setAutoClaimExecutor(address executor) internal {
        AutoClaimStorage storage s = _autoClaimStorage();
        emit AutoClaimExecutorChanged(s.executor, executor);
        s.executor = executor;
    }

    function autoClaimExecutor() public view returns (address) {
        return _autoClaimStorage().executor;
    }

    /// @notice Consent covers all current and future staking pools for this wallet.
    /// Turning off/on invalidates queued operations, but never resets monthly limits.
    function setAutoClaimEnabled(bool enabled) external {
        AutoClaimStorage storage s = _autoClaimStorage();
        require(s.enabled[msg.sender] != enabled, PreferenceUnchanged());
        if (enabled) {
            require(s.executor != address(0), AutoClaimUnavailable());
            require(_hasAutoClaimStake(msg.sender), NotStaker());
        }
        s.enabled[msg.sender] = enabled;
        emit AutoClaimPreferenceChanged(msg.sender, enabled, ++s.consentNonce[msg.sender]);
    }

    function autoClaimPreference(address user) external view returns (bool enabled, uint256 nonce) {
        AutoClaimStorage storage s = _autoClaimStorage();
        return (s.enabled[user], s.consentNonce[user]);
    }

    function lastAutoClaimMonth(uint256 pid, address user) external view returns (uint256) {
        return _autoClaimStorage().lastMonth[pid][user];
    }

    /// @notice UTC Gregorian month encoded as year * 12 + month (January = 1).
    function currentAutoClaimMonth() public view returns (uint256) {
        // Gregorian civil-date conversion, with March as the first month of a year.
        // timestamp / 86400 bounds every intermediate well below uint256.max.
        unchecked {
            uint256 daysFromCivilEpoch = block.timestamp / 1 days + 719468;
            uint256 era = daysFromCivilEpoch / 146097;
            uint256 dayOfEra = daysFromCivilEpoch - era * 146097;
            uint256 yearOfEra = (dayOfEra - dayOfEra / 1460 + dayOfEra / 36524 - dayOfEra / 146096) / 365;
            uint256 year = yearOfEra + era * 400;
            uint256 dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100);
            uint256 monthFromMarch = (5 * dayOfYear + 2) / 153;
            uint256 month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
            if (month <= 2) ++year;
            return year * 12 + month;
        }
    }

    /// @notice Only this entry point is delegated. Owner-only claimFor is unchanged.
    /// A delayed operation cannot claim in a later month or after consent changes.
    function autoClaimFor(uint256[] calldata pids, address user, uint256 month, uint256 consentNonce) external nonReentrant {
        AutoClaimStorage storage s = _autoClaimStorage();
        require(msg.sender == s.executor, NotAutoClaimExecutor());
        require(s.enabled[user], AutoClaimDisabled());
        require(s.consentNonce[user] == consentNonce, StaleConsent());
        require(month == currentAutoClaimMonth(), WrongMonth());
        require(pids.length > 0 && pids.length <= 32, InvalidAutoClaimPools());
        uint256 total;
        for (uint256 i; i < pids.length; ++i) {
            uint256 pid = pids[i];
            require(i == 0 || pid > pids[i - 1], InvalidAutoClaimPools());
            if (s.lastMonth[pid][user] == month) continue;
            uint256 amount = _executeAutoClaim(pid, user);
            if (amount == 0) continue;
            s.lastMonth[pid][user] = month;
            total += amount;
            emit MonthlyAutoClaimed(user, pid, month, amount);
        }
        require(total > 0, NoClaimableRewards());
    }

    function _hasAutoClaimStake(address user) internal view virtual returns (bool);
    function _executeAutoClaim(uint256 pid, address user) internal virtual returns (uint256);
}
