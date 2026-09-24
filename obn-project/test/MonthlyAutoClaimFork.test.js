const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const { impersonateAccount, setBalance, time } = require("@nomicfoundation/hardhat-network-helpers");

(process.env.FORK_MAINNET === "true" ? describe : describe.skip)("V9.3.1 Base fork rehearsal", function () {
  this.timeout(240000);
  it("upgrades the live proxy locally, preserves stakes, and claims for an existing staker", async function () {
    expect(network.name).to.equal("hardhat");
    const proxy = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
    const old = await ethers.getContractAt("contracts/StakingPoolsV93.sol:OBNStakingPools",proxy);
    expect(await old.version()).to.equal("9.3");
    const forkBlock = await ethers.provider.getBlockNumber();
    const owner = await old.owner();
    expect(owner.toLowerCase()).to.equal("0x86396526286769ace21982e798df5eef2389f51c");
    const total = await old.globalTotalStaked();
    const poolCount = Number(await old.poolLength());
    let user;
    for (let pid=0;pid<poolCount;pid++) {
      const pool = await old.poolInfo(pid);
      if (await old.userAmount(pid,pool.charityWallet) > 0n) { user=pool.charityWallet; break; }
    }
    expect(user,"existing charity bootstrap staker").to.be.a("string");
    const stakes = await Promise.all(Array.from({length:poolCount},(_,pid)=>old.userAmount(pid,user)));
    const pids = stakes.flatMap((amount,pid)=>amount>0n?[pid]:[]);
    const [executor] = await ethers.getSigners();
    await impersonateAccount(owner);
    await setBalance(owner,ethers.parseEther("10"));
    const governance = await ethers.getSigner(owner);
    const Next = await ethers.getContractFactory("OBNStakingPoolsV931");
    await upgrades.validateUpgrade(await ethers.getContractFactory("contracts/StakingPoolsV93.sol:OBNStakingPools"),Next,{kind:"uups"});
    const impl = await Next.deploy();
    await impl.waitForDeployment();
    await old.connect(governance).upgradeToAndCall(impl.target,Next.interface.encodeFunctionData("initializeV931",[executor.address]));
    const staking = Next.attach(proxy);
    expect(await staking.globalTotalStaked()).to.equal(total);
    expect(await staking.owner()).to.equal(owner);
    expect(await staking.version()).to.equal("9.3.1");
    expect(await Promise.all(stakes.map((_,pid)=>staking.userAmount(pid,user)))).to.deep.equal(stakes);
    await impersonateAccount(user);
    await setBalance(user,ethers.parseEther("10"));
    const signer = await ethers.getSigner(user);
    await staking.connect(signer).setAutoClaimEnabled(true);
    await time.increase(86400);
    const month = await staking.currentAutoClaimMonth();
    const receipt = await (await staking.connect(executor).autoClaimFor(pids.slice(0,32),user,month,1)).wait();
    for (const pid of pids.slice(0,32)) expect(await staking.lastAutoClaimMonth(pid,user)).to.equal(month);
    await expect(staking.connect(executor).autoClaimFor(pids.slice(0,32),user,month,1)).to.be.revertedWithCustomError(staking,"NoClaimableRewards");
    await staking.connect(signer).setAutoClaimEnabled(false);
    await expect(staking.connect(executor).autoClaimFor(pids.slice(0,32),user,month,1)).to.be.revertedWithCustomError(staking,"AutoClaimDisabled");
    console.log(JSON.stringify({forkBlock,existingStaker:user,pools:pids,claimGas:String(receipt.gasUsed)}));
  });
});
