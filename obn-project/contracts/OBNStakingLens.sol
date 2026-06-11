// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// Minimal read interface for StakingPoolsV93. Only the state/functions the Lens actually calls.
interface IStakingPoolsV93 {
    function poolLength() external view returns (uint256);
    function getPoolInfo(uint256 pid) external view returns (address charityWallet, uint256 totalStaked);
    function userAmount(uint256 pid, address user) external view returns (uint256);
    function userRewardDebt(uint256 pid, address user) external view returns (uint256);
    function lockedAmount(uint256 pid, address user) external view returns (uint256);
    function totalClaimedByUser(address user) external view returns (uint256);
    function totalDepositedByUser(address user) external view returns (uint256);
    function totalWithdrawnByUser(address user) external view returns (uint256);
    function totalDepositedByPool(uint256 pid) external view returns (uint256);
    function totalWithdrawnByPool(uint256 pid) external view returns (uint256);
    function totalCharityMintedByPool(uint256 pid) external view returns (uint256);
    function uniqueStakersByPool(uint256 pid) external view returns (uint256);
    function accRewardPerShare(uint256 pid) external view returns (uint256);
    function lastRewardTime(uint256 pid) external view returns (uint256);
    function charityAccrued(uint256 pid) external view returns (uint256);
    function globalTotalStaked() external view returns (uint256);
    function uniqueStakersGlobal() external view returns (uint256);
    function currentRewardsPerSecond() external view returns (uint256);
    function sumRewardAcrossPhases(uint256 t0, uint256 t1, uint256 poolStake) external view returns (uint256);
    function STAKER_BPS() external view returns (uint256);
    function TOTAL_BPS() external view returns (uint256);
}

/// @title OBNStakingLens
/// @notice Read-only analytics helper for OBN StakingPools. UUPS upgradeable behind Timelock.
///         Holds no funds. Recreates all display/analytics functions removed from StakingPoolsV93
///         during the Lens refactor. Frontend migrates read calls here; all write calls remain
///         on StakingPools.
///
/// Deployment note: deploy as UUPS proxy pointing at the staking proxy address (not the
/// implementation). The proxy address is stable across upgrades and is the value used for
/// NEXT_PUBLIC_LENS_CONTRACT.
///
/// isActive note: OBNStakingLens derives active status from userAmount > 0, which is always
/// equivalent to the private _isActiveStaker[pid][user] flag in StakingPools (the flag is set
/// true on first deposit and cleared on full withdrawal, tracking balance exactly).
contract OBNStakingLens is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    // ─── Storage ──────────────────────────────────────────────────────────────────

    IStakingPoolsV93 public stakingPools; // slot 0

    uint256[49] private __gap; // slots 1-49; 50 slots total reserved for this contract

    // ─── Constructor / initializer ────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param stakingPoolsProxy_ The staking proxy address (not the implementation).
    /// @param timelockOwner_     The Timelock address that controls upgrades.
    function initialize(address stakingPoolsProxy_, address timelockOwner_) external initializer {
        require(stakingPoolsProxy_ != address(0), "staking=0");
        require(timelockOwner_     != address(0), "owner=0");
        __Ownable_init(timelockOwner_);
        __UUPSUpgradeable_init();
        stakingPools = IStakingPoolsV93(stakingPoolsProxy_);
    }

    // ─── Upgrade authorization ────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── User-level views ──────────────────────────────────────────────────────

    function getUserStats(address userAddr)
        external
        view
        returns (
            uint256 totalUserStaked,
            uint256 totalUserClaimed,
            uint256 totalUserDeposited,
            uint256 totalUserWithdrawn,
            uint256 poolCount
        )
    {
        uint256 len = stakingPools.poolLength();
        for (uint256 i = 0; i < len; i++) {
            uint256 amt = stakingPools.userAmount(i, userAddr);
            if (amt > 0) {
                poolCount++;
                totalUserStaked += amt;
            }
        }
        return (
            totalUserStaked,
            stakingPools.totalClaimedByUser(userAddr),
            stakingPools.totalDepositedByUser(userAddr),
            stakingPools.totalWithdrawnByUser(userAddr),
            poolCount
        );
    }

    function getUserPoolView(uint256 pid, address user)
        external
        view
        returns (
            uint256 staked,
            uint256 locked,
            uint256 unlocked,
            uint256 rewardDebt,
            uint256 pending,
            bool isActive
        )
    {
        staked     = stakingPools.userAmount(pid, user);
        locked     = stakingPools.lockedAmount(pid, user);
        if (locked > staked) locked = staked;
        unlocked   = staked - locked;
        rewardDebt = stakingPools.userRewardDebt(pid, user);

        (, uint256 poolTotalStaked) = stakingPools.getPoolInfo(pid);
        uint256 acc  = stakingPools.accRewardPerShare(pid);
        uint256 last = stakingPools.lastRewardTime(pid);

        if (block.timestamp > last && poolTotalStaked != 0) {
            uint256 rewardGross = stakingPools.sumRewardAcrossPhases(last, block.timestamp, poolTotalStaked);
            if (rewardGross > 0) {
                acc += Math.mulDiv(rewardGross, 1e12, poolTotalStaked);
            }
        }

        pending  = ((staked * acc) / 1e12) - rewardDebt;
        isActive = staked > 0;
    }

    // ─── Pool-level views ──────────────────────────────────────────────────────

    function pendingCharityFor(uint256 pid) external view returns (uint256) {
        if (pid >= stakingPools.poolLength()) return 0;
        return stakingPools.charityAccrued(pid);
    }

    function getPoolStats(uint256 pid)
        external
        view
        returns (
            address charityWallet,
            uint256 totalStaked,
            uint256 uniqueStakers,
            uint256 accPerShare,
            uint256 lastTime,
            uint256 accruedCharity,
            uint256 depositedAllTime,
            uint256 withdrawnAllTime,
            uint256 charityMintedAllTime
        )
    {
        (charityWallet, totalStaked) = stakingPools.getPoolInfo(pid);
        uniqueStakers        = stakingPools.uniqueStakersByPool(pid);
        accPerShare          = stakingPools.accRewardPerShare(pid);
        lastTime             = stakingPools.lastRewardTime(pid);
        accruedCharity       = stakingPools.charityAccrued(pid);
        depositedAllTime     = stakingPools.totalDepositedByPool(pid);
        withdrawnAllTime     = stakingPools.totalWithdrawnByPool(pid);
        charityMintedAllTime = stakingPools.totalCharityMintedByPool(pid);
    }

    function listPoolsBasic()
        external
        view
        returns (
            address[] memory charityWallets,
            uint256[] memory totals,
            uint256[] memory uniqueCounts
        )
    {
        uint256 len    = stakingPools.poolLength();
        charityWallets = new address[](len);
        totals         = new uint256[](len);
        uniqueCounts   = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            (charityWallets[i], totals[i]) = stakingPools.getPoolInfo(i);
            uniqueCounts[i] = stakingPools.uniqueStakersByPool(i);
        }
    }

    function pendingRewards(uint256 pid, address userAddr) external view returns (uint256) {
        (, uint256 poolTotalStaked) = stakingPools.getPoolInfo(pid);
        uint256 acc  = stakingPools.accRewardPerShare(pid);
        uint256 last = stakingPools.lastRewardTime(pid);

        if (block.timestamp > last && poolTotalStaked != 0) {
            uint256 rewardGross = stakingPools.sumRewardAcrossPhases(last, block.timestamp, poolTotalStaked);
            if (rewardGross > 0) {
                acc += Math.mulDiv(rewardGross, 1e12, poolTotalStaked);
            }
        }

        uint256 bal  = stakingPools.userAmount(pid, userAddr);
        uint256 debt = stakingPools.userRewardDebt(pid, userAddr);
        return ((bal * acc) / 1e12) - debt;
    }

    function getPoolAPR(uint256 pid) external view returns (uint256 aprBps) {
        (, uint256 poolTotalStaked) = stakingPools.getPoolInfo(pid);
        if (poolTotalStaked == 0) return 0;

        uint256 yearlyPoolGross = stakingPools.sumRewardAcrossPhases(
            block.timestamp,
            block.timestamp + 365 days,
            poolTotalStaked
        );
        if (yearlyPoolGross == 0) return 0;

        uint256 stakerBps    = stakingPools.STAKER_BPS();
        uint256 totalBps     = stakingPools.TOTAL_BPS();
        uint256 stakerYearly = Math.mulDiv(yearlyPoolGross, stakerBps, totalBps);
        return Math.mulDiv(stakerYearly, totalBps, poolTotalStaked);
    }

    function pendingRewardsMultiple(uint256[] calldata pids, address user)
        external
        view
        returns (uint256[] memory pendings, uint256 total)
    {
        uint256 poolLen = stakingPools.poolLength();
        pendings = new uint256[](pids.length);
        for (uint256 i = 0; i < pids.length; i++) {
            uint256 pid = pids[i];
            if (pid >= poolLen) continue;

            (, uint256 poolTotalStaked) = stakingPools.getPoolInfo(pid);
            uint256 acc  = stakingPools.accRewardPerShare(pid);
            uint256 last = stakingPools.lastRewardTime(pid);

            if (block.timestamp > last && poolTotalStaked != 0) {
                uint256 rewardGross = stakingPools.sumRewardAcrossPhases(last, block.timestamp, poolTotalStaked);
                if (rewardGross > 0) {
                    acc += Math.mulDiv(rewardGross, 1e12, poolTotalStaked);
                }
            }

            uint256 bal  = stakingPools.userAmount(pid, user);
            uint256 debt = stakingPools.userRewardDebt(pid, user);
            uint256 p    = ((bal * acc) / 1e12) - debt;

            pendings[i] = p;
            total       += p;
        }
    }

    // ─── Global views ──────────────────────────────────────────────────────────

    function getGlobalStats()
        external
        view
        returns (
            uint256 poolCount,
            uint256 totalStaked_,
            uint256 uniqueStakers_,
            uint256 rps
        )
    {
        poolCount      = stakingPools.poolLength();
        totalStaked_   = stakingPools.globalTotalStaked();
        uniqueStakers_ = stakingPools.uniqueStakersGlobal();
        rps            = stakingPools.currentRewardsPerSecond();
    }

    function currentRewardsPerSecond() external view returns (uint256) {
        return stakingPools.currentRewardsPerSecond();
    }
}
