// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOBNMintable is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract OBNStakingPools is Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IOBNMintable;

    struct PoolInfo {
        address charityWallet;
        bool active;
        uint256 totalStaked;
    }

    struct UserPoolInfo {
        uint256 amount;
    }

    struct Phase {
        uint256 start;
        uint256 end;
        uint256 bps;
    }

    IOBNMintable public stakingToken;
    address public treasury;
    uint256 public treasuryBps;
    uint256 public constant CHARITY_BPS = 1500; // 15%
    string public currentVersion;
    bool public paused;

    Phase[] public phases;
    PoolInfo[] public poolInfo;
    mapping(uint256 => mapping(address => UserPoolInfo)) public userPool;

    uint256 public globalTotalStaked;
    uint256 public globalAccRewardPerShare;
    uint256 public lastGlobalRewardTime;

    mapping(address => uint256) public userTotalStaked;
    mapping(address => uint256) public userRewardDebt;

    mapping(address => uint256) public totalClaimedByUser;
    mapping(address => uint256) public totalDepositedByUser;
    mapping(address => uint256) public totalWithdrawnByUser;

    mapping(uint256 => uint256) public totalClaimedByPool;
    mapping(uint256 => uint256) public totalDepositedByPool;
    mapping(uint256 => uint256) public totalWithdrawnByPool;

    event PoolAdded(uint256 indexed pid, address charityWallet);
    event PoolRetired(uint256 indexed pid);
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Claim(address indexed user, uint256 amount, bool toStake);
    event TreasuryBpsChanged(uint256 newBps);
    event Paused(bool isPaused);
    event PhaseAdded(uint256 start, uint256 end, uint256 bps);
    event ContractVersion(string version);
    event RewardStaked(address indexed user, uint256 indexed pid, uint256 amount);

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IOBNMintable _stakingToken,
        address _treasury
    ) public initializer {
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);

        require(address(_stakingToken) != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");

        stakingToken = _stakingToken;
        treasury = _treasury;
        treasuryBps = 500;

        uint256 start = block.timestamp;
        uint256 year = 365 days;
        phases.push(Phase(start, start + 2 * year, 1000));
        phases.push(Phase(start + 2 * year, start + 4 * year, 750));
        phases.push(Phase(start + 4 * year, start + 6 * year, 500));
        phases.push(Phase(start + 6 * year, start + 8 * year, 250));
        phases.push(Phase(start + 8 * year, start + 10 * year, 125));

        lastGlobalRewardTime = block.timestamp;
        currentVersion = "2.0.0";
        emit ContractVersion(currentVersion);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {
        currentVersion = "2.0.X";
        emit ContractVersion(currentVersion);
    }

    // ----------------- Admin -----------------
    function addPool(address charityWallet) external onlyOwner {
        require(charityWallet != address(0), "Invalid charity");
        poolInfo.push(PoolInfo(charityWallet, true, 0));
        emit PoolAdded(poolInfo.length - 1, charityWallet);
    }

    function retirePool(uint256 pid) external onlyOwner {
        require(pid < poolInfo.length, "Invalid pool");
        poolInfo[pid].active = false;
        emit PoolRetired(pid);
    }

    function setTreasuryBps(uint256 newBps) external onlyOwner {
        require(newBps >= 100 && newBps <= 500, "1-5%");
        treasuryBps = newBps;
        emit TreasuryBpsChanged(newBps);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function addPhase(uint256 start, uint256 end, uint256 bps) external onlyOwner {
        require(start < end, "Invalid");
        phases.push(Phase(start, end, bps));
        emit PhaseAdded(start, end, bps);
    }

    function sweep(address token, uint256 amount) external onlyOwner {
        require(token != address(stakingToken), "Cannot sweep staking token");
        IERC20(token).transfer(treasury, amount);
    }

    // ----------------- Emissions -----------------
    function currentRewardsPerSecond() public view returns (uint256) {
        uint256 nowTs = block.timestamp;
        for (uint256 i = 0; i < phases.length; i++) {
            if (nowTs >= phases[i].start && nowTs < phases[i].end) {
                uint256 yearly = (globalTotalStaked * phases[i].bps) / 10000;
                return yearly / (365 days);
            }
        }
        return 0;
    }

    function _updateGlobal() internal {
        if (block.timestamp <= lastGlobalRewardTime) return;
        if (globalTotalStaked == 0) {
            lastGlobalRewardTime = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - lastGlobalRewardTime;
        uint256 reward = elapsed * currentRewardsPerSecond();
        if (reward > 0) {
            uint256 charityCut = (reward * CHARITY_BPS) / 10000;
            uint256 tCut = (reward * treasuryBps) / 10000;
            uint256 sCut = reward - charityCut - tCut;

            if (sCut > 0) {
                stakingToken.mint(address(this), sCut);
                globalAccRewardPerShare += (sCut * 1e12) / globalTotalStaked;
            }
            if (tCut > 0) stakingToken.mint(treasury, tCut);

            if (charityCut > 0 && poolInfo.length > 0) {
                for (uint256 i = 0; i < poolInfo.length; i++) {
                    if (poolInfo[i].active && poolInfo[i].totalStaked > 0) {
                        uint256 portion = (charityCut * poolInfo[i].totalStaked) / globalTotalStaked;
                        if (portion > 0) {
                            stakingToken.mint(poolInfo[i].charityWallet, portion);
                        }
                    }
                }
            }
        }
        lastGlobalRewardTime = block.timestamp;
    }

    function _claimRewardsFor(address user) internal returns (uint256 pending) {
        pending = ((userTotalStaked[user] * globalAccRewardPerShare) / 1e12) - userRewardDebt[user];
        if (pending > 0) {
            stakingToken.mint(user, pending);
            totalClaimedByUser[user] += pending;
            emit Claim(user, pending, false);
        }
    }

    // ----------------- User Actions -----------------
    function deposit(uint256 pid, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Cannot stake 0 tokens");
        require(poolInfo[pid].active, "Pool retired");
        _updateGlobal();

        // ✅ auto-claim pending rewards before updating stake
        _claimRewardsFor(msg.sender);

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        userPool[pid][msg.sender].amount += amount;
        poolInfo[pid].totalStaked += amount;
        userTotalStaked[msg.sender] += amount;
        globalTotalStaked += amount;
        totalDepositedByUser[msg.sender] += amount;
        totalDepositedByPool[pid] += amount;

        userRewardDebt[msg.sender] = (userTotalStaked[msg.sender] * globalAccRewardPerShare) / 1e12;
        emit Deposit(msg.sender, pid, amount);
    }

    function withdraw(uint256 pid, uint256 amount) public nonReentrant whenNotPaused {
        require(userPool[pid][msg.sender].amount >= amount, "Exceeds staked amount");
        require(amount > 0, "Cannot withdraw 0 tokens");
        _updateGlobal();

        // ✅ auto-claim pending rewards before updating stake
        _claimRewardsFor(msg.sender);

        userPool[pid][msg.sender].amount -= amount;
        poolInfo[pid].totalStaked -= amount;
        userTotalStaked[msg.sender] -= amount;
        globalTotalStaked -= amount;
        totalWithdrawnByUser[msg.sender] += amount;
        totalWithdrawnByPool[pid] += amount;

        userRewardDebt[msg.sender] = (userTotalStaked[msg.sender] * globalAccRewardPerShare) / 1e12;

        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, pid, amount);
    }

    function claimToWallet() external nonReentrant whenNotPaused {
        _updateGlobal();
        uint256 pending = _claimRewardsFor(msg.sender);
        userRewardDebt[msg.sender] = (userTotalStaked[msg.sender] * globalAccRewardPerShare) / 1e12;
        emit Claim(msg.sender, pending, false);
    }

    function emergencyWithdraw(uint256 pid) external nonReentrant {
        uint256 amt = userPool[pid][msg.sender].amount;
        require(amt > 0, "Nothing staked");
        userPool[pid][msg.sender].amount = 0;
        poolInfo[pid].totalStaked -= amt;
        userTotalStaked[msg.sender] -= amt;
        globalTotalStaked -= amt;

        stakingToken.safeTransfer(msg.sender, amt);
        emit Withdraw(msg.sender, pid, amt);
    }

    // ----------------- Views -----------------
    function getPoolInfo(uint256 pid) external view returns (address charityWallet, bool active, uint256 totalStaked) {
        PoolInfo memory p = poolInfo[pid];
        return (p.charityWallet, p.active, p.totalStaked);
    }

    function getTotalStakedAcrossPools() external view returns (uint256) {
        return globalTotalStaked;
    }

    function pendingRewards(address userAddr) public view returns (uint256) {
        uint256 acc = globalAccRewardPerShare;
        if (block.timestamp > lastGlobalRewardTime && globalTotalStaked != 0) {
            uint256 elapsed = block.timestamp - lastGlobalRewardTime;
            uint256 reward = elapsed * currentRewardsPerSecond();
            uint256 sCut = reward - ((reward * CHARITY_BPS) / 10000) - ((reward * treasuryBps) / 10000);
            acc += (sCut * 1e12) / globalTotalStaked;
        }
        return ((userTotalStaked[userAddr] * acc) / 1e12) - userRewardDebt[userAddr];
    }

    function getUserStakeValue(uint256 pid, address userAddr) external view returns (uint256) {
        return userPool[pid][userAddr].amount;
    }

    function getUserStats(address userAddr) external view returns (
        uint256 totalUserStaked,
        uint256 totalUserClaimed,
        uint256 totalUserDeposited,
        uint256 totalUserWithdrawn,
        uint256 poolCount
    ) {
        for (uint256 i = 0; i < poolInfo.length; i++) {
            if (userPool[i][userAddr].amount > 0) {
                poolCount++;
                totalUserStaked += userPool[i][userAddr].amount;
            }
        }
        return (
            totalUserStaked,
            totalClaimedByUser[userAddr],
            totalDepositedByUser[userAddr],
            totalWithdrawnByUser[userAddr],
            poolCount
        );
    }

    function getUserInfo(uint256 pid, address userAddr) external view returns (uint256) {
        return userPool[pid][userAddr].amount;
    }

    function getPoolAPR() external view returns (uint256 aprBps) {
        if (globalTotalStaked == 0) return 0;
        uint256 yearly = currentRewardsPerSecond() * 365 days;
        return (yearly * 10000) / globalTotalStaked;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function getEmissionStatus() external view returns (
        uint256 currentBps,
        uint256 emissionPerSecond,
        uint256 phaseStart,
        uint256 phaseEnd
    ) {
        uint256 nowTs = block.timestamp;
        for (uint256 i = 0; i < phases.length; i++) {
            if (nowTs >= phases[i].start && nowTs < phases[i].end) {
                currentBps = phases[i].bps;
                emissionPerSecond = (globalTotalStaked * currentBps) / 10000 / (365 days);
                phaseStart = phases[i].start;
                phaseEnd = phases[i].end;
                return (currentBps, emissionPerSecond, phaseStart, phaseEnd);
            }
        }
        return (0, 0, 0, 0);
    }
}