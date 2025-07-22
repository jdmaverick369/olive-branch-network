// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IOBNMintable is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract StakingPools is Ownable, ReentrancyGuard {
    struct Pool {
        address charityWallet;
        bool active;
        uint256 totalStaked;
        uint256 accRewardPerShare;
        uint256 lastRewardTime;
        address boostNFT; // NEW: optional NFT contract for bonus
        uint256 voteWeight; // NEW: weight for governance purposes
    }

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
        bool withTreasury; // true = 80/15/5, false = 85/15
    }

    struct Phase {
        uint256 start;
        uint256 end;
        uint256 bps;
    }

    IOBNMintable public immutable stakingToken;
    address public treasury;
    uint256 public initialSupply;
    uint256 public startTimestamp;
    Phase[] public phases;
    Pool[] public pools;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // ✅ Events
    event PoolAdded(uint256 indexed pid, address charityWallet);
    event PoolRetired(uint256 indexed pid);
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Claim(address indexed user, uint256 indexed pid, uint256 stakerAmount, uint256 charityAmount, uint256 treasuryAmount);
    event Compound(address indexed user, uint256 indexed pid, uint256 addedStake, uint256 charityAmount, uint256 treasuryAmount);
    event Voted(address indexed user, uint256 indexed pid, uint256 weight);
    event BoostNFTSet(uint256 indexed pid, address nft);

    constructor(
        IOBNMintable _stakingToken,
        address _treasury,
        address initialOwner,
        uint256 _initialSupply
    ) Ownable(initialOwner) {
        require(address(_stakingToken) != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");

        stakingToken = _stakingToken;
        treasury = _treasury;
        initialSupply = _initialSupply;
        startTimestamp = block.timestamp;

        uint256 year = 365 days;
        phases.push(Phase({start: startTimestamp, end: startTimestamp + 2 * year, bps: 1000}));
        phases.push(Phase({start: startTimestamp + 2 * year, end: startTimestamp + 4 * year, bps: 750}));
        phases.push(Phase({start: startTimestamp + 4 * year, end: startTimestamp + 6 * year, bps: 500}));
        phases.push(Phase({start: startTimestamp + 6 * year, end: startTimestamp + 8 * year, bps: 250}));
        phases.push(Phase({start: startTimestamp + 8 * year, end: startTimestamp + 10 * year, bps: 125}));
    }

    // ---------------- Pool Management ----------------
    function addPool(address charityWallet) external onlyOwner {
        require(charityWallet != address(0), "Invalid charity");
        pools.push(Pool({
            charityWallet: charityWallet,
            active: true,
            totalStaked: 0,
            accRewardPerShare: 0,
            lastRewardTime: block.timestamp,
            boostNFT: address(0),
            voteWeight: 0
        }));
        emit PoolAdded(pools.length - 1, charityWallet);
    }

    function setBoostNFT(uint256 pid, address nft) external onlyOwner {
        require(pid < pools.length, "Invalid pool");
        pools[pid].boostNFT = nft;
        emit BoostNFTSet(pid, nft);
    }

    function setVoteWeight(uint256 pid, uint256 weight) external onlyOwner {
        require(pid < pools.length, "Invalid pool");
        pools[pid].voteWeight = weight;
    }

    function retirePool(uint256 pid) external onlyOwner {
        require(pid < pools.length, "Invalid pool");
        pools[pid].active = false;
        emit PoolRetired(pid);
    }

    function poolLength() external view returns (uint256) {
        return pools.length;
    }

    // ---------------- Voting ----------------
    function vote(uint256 pid, uint256 weight) external {
        require(pid < pools.length, "Invalid pool");
        UserInfo storage user = userInfo[pid][msg.sender];
        require(user.amount > 0, "Stake required to vote");
        // On-chain record (off-chain tally can read this)
        emit Voted(msg.sender, pid, weight);
    }

    // ---------------- User Functions ----------------
    function setTreasuryPreference(uint256 pid, bool enable) external {
        userInfo[pid][msg.sender].withTreasury = enable;
    }

    function deposit(uint256 pid, uint256 amount) external nonReentrant {
        Pool storage pool = pools[pid];
        require(pool.active, "Pool retired");
        _updatePool(pid);

        UserInfo storage user = userInfo[pid][msg.sender];
        if (user.amount == 0) {
            user.withTreasury = true; // default 80/15/5
        }

        if (user.amount > 0) {
            uint256 pending = ((user.amount * pool.accRewardPerShare) / 1e12) - user.rewardDebt;
            if (pending > 0) {
                _mintRewards(pid, msg.sender, pending, user.withTreasury);
            }
        }

        if (amount > 0) {
            IERC20(address(stakingToken)).transferFrom(msg.sender, address(this), amount);
            user.amount += amount;
            pool.totalStaked += amount;
        }

        user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
        emit Deposit(msg.sender, pid, amount);
    }

    function withdraw(uint256 pid, uint256 amount) external nonReentrant {
        Pool storage pool = pools[pid];
        UserInfo storage user = userInfo[pid][msg.sender];
        require(user.amount >= amount, "Withdraw > staked");

        _updatePool(pid);

        uint256 pending = ((user.amount * pool.accRewardPerShare) / 1e12) - user.rewardDebt;
        if (pending > 0) {
            _mintRewards(pid, msg.sender, pending, user.withTreasury);
        }

        if (amount > 0) {
            user.amount -= amount;
            pool.totalStaked -= amount;
            IERC20(address(stakingToken)).transfer(msg.sender, amount);
        }

        user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
        emit Withdraw(msg.sender, pid, amount);
    }

    function claim(uint256 pid) external nonReentrant {
        Pool storage pool = pools[pid];
        UserInfo storage user = userInfo[pid][msg.sender];

        _updatePool(pid);

        uint256 pending = ((user.amount * pool.accRewardPerShare) / 1e12) - user.rewardDebt;
        require(pending > 0, "Nothing to claim");

        _mintRewards(pid, msg.sender, pending, user.withTreasury);
        user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
    }

    function compound(uint256 pid) external nonReentrant {
        Pool storage pool = pools[pid];
        UserInfo storage user = userInfo[pid][msg.sender];

        _updatePool(pid);

        uint256 pending = ((user.amount * pool.accRewardPerShare) / 1e12) - user.rewardDebt;
        require(pending > 0, "Nothing to compound");

        uint256 boosted = _applyNFTBoost(pid, msg.sender, pending);

        uint256 stakerCut;
        uint256 charityCut;
        uint256 treasuryCut;

        if (user.withTreasury) {
            treasuryCut = (boosted * 5) / 100;
            charityCut = (boosted * 15) / 100;
            stakerCut = boosted - charityCut - treasuryCut;
        } else {
            charityCut = (boosted * 15) / 100;
            stakerCut = boosted - charityCut;
            treasuryCut = 0;
        }

        stakingToken.mint(address(this), stakerCut);
        user.amount += stakerCut;
        pool.totalStaked += stakerCut;

        stakingToken.mint(pool.charityWallet, charityCut);
        if (treasuryCut > 0) {
            stakingToken.mint(treasury, treasuryCut);
        }

        user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
        emit Compound(msg.sender, pid, stakerCut, charityCut, treasuryCut);
    }

    function emergencyWithdraw(uint256 pid) external nonReentrant {
        UserInfo storage user = userInfo[pid][msg.sender];
        uint256 amount = user.amount;
        require(amount > 0, "Nothing staked");
        user.amount = 0;
        user.rewardDebt = 0;
        pools[pid].totalStaked -= amount;
        IERC20(address(stakingToken)).transfer(msg.sender, amount);
        emit Withdraw(msg.sender, pid, amount);
    }

    // ---------------- Internal Logic ----------------
    function currentRewardsPerSecond() public view returns (uint256) {
        uint256 nowTs = block.timestamp;
        for (uint256 i = 0; i < phases.length; i++) {
            if (nowTs >= phases[i].start && nowTs < phases[i].end) {
                uint256 yearlyReward = (initialSupply * phases[i].bps) / 10000;
                return yearlyReward / (365 days);
            }
        }
        return 0;
    }

    function _updatePool(uint256 pid) internal {
        Pool storage pool = pools[pid];
        if (block.timestamp <= pool.lastRewardTime) return;
        if (pool.totalStaked == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }
        uint256 timeElapsed = block.timestamp - pool.lastRewardTime;
        uint256 reward = timeElapsed * currentRewardsPerSecond();
        pool.accRewardPerShare += (reward * 1e12) / pool.totalStaked;
        pool.lastRewardTime = block.timestamp;
    }

    function _mintRewards(uint256 pid, address user, uint256 amount, bool withTreasury) internal {
        Pool storage pool = pools[pid];

        uint256 boosted = _applyNFTBoost(pid, user, amount);

        if (withTreasury) {
            uint256 treasuryCut = (boosted * 5) / 100;
            uint256 charityCut = (boosted * 15) / 100;
            uint256 stakerCut = boosted - charityCut - treasuryCut;

            stakingToken.mint(user, stakerCut);
            stakingToken.mint(pool.charityWallet, charityCut);
            stakingToken.mint(treasury, treasuryCut);
            emit Claim(user, pid, stakerCut, charityCut, treasuryCut);
        } else {
            uint256 charityCut = (boosted * 15) / 100;
            uint256 stakerCut = boosted - charityCut;

            stakingToken.mint(user, stakerCut);
            stakingToken.mint(pool.charityWallet, charityCut);
            emit Claim(user, pid, stakerCut, charityCut, 0);
        }
    }

    function _applyNFTBoost(uint256 pid, address user, uint256 baseAmount) internal view returns (uint256) {
        Pool storage pool = pools[pid];
        if (pool.boostNFT != address(0)) {
            try IERC721(pool.boostNFT).balanceOf(user) returns (uint256 bal) {
                if (bal > 0) {
                    return (baseAmount * 110) / 100; // 10% boost
                }
            } catch {}
        }
        return baseAmount;
    }

    // ---------------- Views ----------------
    function getPool(uint256 pid) external view returns (
        address charityWallet,
        bool active,
        uint256 totalStaked,
        uint256 accRewardPerShare,
        uint256 lastRewardTime
    ) {
        require(pid < pools.length, "Invalid pool");
        Pool memory pool = pools[pid];
        return (pool.charityWallet, pool.active, pool.totalStaked, pool.accRewardPerShare, pool.lastRewardTime);
    }

    function getUserStaked(uint256 pid, address user) external view returns (uint256) {
        return userInfo[pid][user].amount;
    }

    function getPoolInfo(uint256 pid) external view returns (
        address charityWallet,
        bool active,
        uint256 totalStaked,
        uint256 accRewardPerShare,
        uint256 lastRewardTime
    ) {
        Pool memory p = pools[pid];
        return (p.charityWallet, p.active, p.totalStaked, p.accRewardPerShare, p.lastRewardTime);
    }

    function getUserInfo(uint256 pid, address userAddr) external view returns (uint256, uint256, bool) {
        UserInfo memory u = userInfo[pid][userAddr];
        return (u.amount, u.rewardDebt, u.withTreasury);
    }

    function pendingRewards(uint256 pid, address userAddr) external view returns (uint256) {
        Pool memory pool = pools[pid];
        UserInfo memory user = userInfo[pid][userAddr];
        uint256 acc = pool.accRewardPerShare;
        if (block.timestamp > pool.lastRewardTime && pool.totalStaked != 0) {
            uint256 timeElapsed = block.timestamp - pool.lastRewardTime;
            uint256 reward = timeElapsed * currentRewardsPerSecond();
            acc += (reward * 1e12) / pool.totalStaked;
        }
        uint256 pending = (user.amount * acc) / 1e12 - user.rewardDebt;
        return pending;
    }

    function getAllPools() external view returns (
        address[] memory charityWallets,
        bool[] memory activeFlags,
        uint256[] memory totalStakedArr,
        uint256[] memory accRewardPerShareArr,
        uint256[] memory lastRewardTimes
    ) {
        uint256 length = pools.length;
        charityWallets = new address[](length);
        activeFlags = new bool[](length);
        totalStakedArr = new uint256[](length);
        accRewardPerShareArr = new uint256[](length);
        lastRewardTimes = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            Pool storage p = pools[i];
            charityWallets[i] = p.charityWallet;
            activeFlags[i] = p.active;
            totalStakedArr[i] = p.totalStaked;
            accRewardPerShareArr[i] = p.accRewardPerShare;
            lastRewardTimes[i] = p.lastRewardTime;
        }
    }

    function batchClaim(uint256[] calldata pids) external nonReentrant {
        for (uint256 i = 0; i < pids.length; i++) {
            uint256 pid = pids[i];
            Pool storage pool = pools[pid];
            UserInfo storage user = userInfo[pid][msg.sender];
            _updatePool(pid);
            uint256 pending = ((user.amount * pool.accRewardPerShare) / 1e12) - user.rewardDebt;
            if (pending > 0) {
                _mintRewards(pid, msg.sender, pending, user.withTreasury);
                user.rewardDebt = (user.amount * pool.accRewardPerShare) / 1e12;
            }
        }
    }
}