// BallotEligibility.test.js
//
// Tests the poolFullyRemoved flag on StakingPoolsV93, which AnnualGovernance uses to build
// the Phase 2 ballot. Covers:
//   1. Active pools appear on ballot        (poolFullyRemoved == false)
//   2. Shutdown pools still appear on ballot (poolRemoved == true, poolFullyRemoved == false)
//   3. Fully removed pools do not appear    (poolFullyRemoved == true)
//   4. poolFullyRemoved is NOT set by shutdownPool
//
// NOTE — deduplication of duplicate charity wallets is tested in AnnualGovernance.test.js
//        because the deduplication logic lives in AnnualGovernance.startAnnualCycle().
//
// NOTE — pre-v9.3 assumption: zero pools were removed before the v9.3 migration on Base mainnet,
//        so poolFullyRemoved is authoritative from the moment the v9.3 upgrade is deployed.
//        No retroactive flag-setting is needed.

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("BallotEligibility — poolFullyRemoved flag (StakingPoolsV93)", function () {
  let pools, token;
  let owner, treasury, charityFund, charityFundOperator;
  let nonprofit1, nonprofit2, nonprofit3;

  const ZERO = ethers.ZeroAddress;

  beforeEach(async function () {
    [owner, treasury, charityFund, charityFundOperator, nonprofit1, nonprofit2, nonprofit3] =
      await ethers.getSigners();

    // ── Deploy OBNToken ──────────────────────────────────────────────────────
    const OBNToken = await ethers.getContractFactory("OBNToken");
    token = await upgrades.deployProxy(
      OBNToken,
      [
        owner.address,   // initialOwner
        ethers.parseEther("1000000000"),
        owner.address,   // liquidity
        owner.address,   // airdrop
        owner.address,   // charity
        owner.address,   // treasury
        owner.address,   // teamVesting
      ],
      { kind: "uups" }
    );
    await token.waitForDeployment();
    await token.setMinterOnce(owner.address);

    // ── Deploy StakingPoolsV93 ───────────────────────────────────────────────
    // Use fully qualified name to resolve ambiguity with v9.2 contract.
    const PoolsFactory = await ethers.getContractFactory(
      "contracts/StakingPoolsV93.sol:OBNStakingPools"
    );
    const proxy = await upgrades.deployProxy(
      PoolsFactory,
      [await token.getAddress(), treasury.address, charityFund.address],
      { kind: "uups" }
    );
    await proxy.waitForDeployment();
    pools = proxy;

    // migrateV93 sets upgradeBlock, new treasury/charityFund/charityFundOperator
    await pools.migrateV93(treasury.address, charityFund.address, charityFundOperator.address);

    // Add three pools with distinct charity wallets
    await pools.addPool(nonprofit1.address);  // pid 0
    await pools.addPool(nonprofit2.address);  // pid 1
    await pools.addPool(nonprofit3.address);  // pid 2
  });

  // ── 1. Active pools ────────────────────────────────────────────────────────

  it("active pool: poolRemoved = false, poolFullyRemoved = false", async function () {
    expect(await pools.poolRemoved(0)).to.equal(false);
    expect(await pools.poolFullyRemoved(0)).to.equal(false);
  });

  it("all three active pools are ballot-eligible (poolFullyRemoved == false)", async function () {
    for (let pid = 0; pid < 3; pid++) {
      expect(await pools.poolFullyRemoved(pid)).to.equal(false,
        `pid ${pid} should be ballot-eligible`);
    }
  });

  // ── 2. Shutdown pools ─────────────────────────────────────────────────────

  it("shutdownPool sets poolRemoved = true but NOT poolFullyRemoved", async function () {
    await pools.shutdownPool(0);

    expect(await pools.poolRemoved(0)).to.equal(true,
      "shutdownPool should set poolRemoved");
    expect(await pools.poolFullyRemoved(0)).to.equal(false,
      "shutdownPool must NOT set poolFullyRemoved — shutdown pools remain ballot-eligible");
  });

  it("shutdown pool on pid 1 does not affect eligibility of pids 0 or 2", async function () {
    await pools.shutdownPool(1);

    expect(await pools.poolFullyRemoved(0)).to.equal(false);
    expect(await pools.poolFullyRemoved(1)).to.equal(false);  // shutdown, still eligible
    expect(await pools.poolFullyRemoved(2)).to.equal(false);
  });

  // ── 3. Fully removed pools ────────────────────────────────────────────────

  it("removePool sets both poolRemoved and poolFullyRemoved = true", async function () {
    // pid 0 was just added, totalStaked == 0, so removePool is callable immediately
    await pools.removePool(0);

    expect(await pools.poolRemoved(0)).to.equal(true);
    expect(await pools.poolFullyRemoved(0)).to.equal(true,
      "fully removed pool must not appear on ballot");
  });

  it("removePool on pid 0 does not affect ballot eligibility of pids 1 and 2", async function () {
    await pools.removePool(0);

    expect(await pools.poolFullyRemoved(0)).to.equal(true);   // removed
    expect(await pools.poolFullyRemoved(1)).to.equal(false);  // still eligible
    expect(await pools.poolFullyRemoved(2)).to.equal(false);  // still eligible
  });

  it("removePool after shutdownPool also sets poolFullyRemoved", async function () {
    await pools.shutdownPool(1);
    // pid 1 has no stakers so totalStaked == 0 — removePool is valid
    await pools.removePool(1);

    expect(await pools.poolRemoved(1)).to.equal(true);
    expect(await pools.poolFullyRemoved(1)).to.equal(true);
  });

  it("removePool reverts on a non-empty pool", async function () {
    // Mint and stake into pid 0
    await token.mint(owner.address, ethers.parseEther("1000"));
    await token.approve(await pools.getAddress(), ethers.parseEther("1000"));
    await pools.deposit(0, ethers.parseEther("100"));

    await expect(pools.removePool(0)).to.be.revertedWith("Pool not empty");

    // poolFullyRemoved must remain false after a failed removePool
    expect(await pools.poolFullyRemoved(0)).to.equal(false);
  });

  // ── 4. AnnualGovernance ballot filter integration point ───────────────────
  //
  // AnnualGovernance.startAnnualCycle() iterates poolLength() and checks:
  //   !stakingPools.poolFullyRemoved(pid)
  // to determine ballot eligibility. The tests below validate the exact values
  // that startAnnualCycle() will read for mixed-state pool sets.

  it("mixed state: active=eligible, shutdown=eligible, removed=ineligible", async function () {
    // pid 0: active
    // pid 1: shutdown
    // pid 2: removed
    await pools.shutdownPool(1);
    await pools.removePool(2);

    // Build expected ballot (what startAnnualCycle will collect)
    const eligible = [];
    const len = await pools.poolLength();
    for (let pid = 0; pid < len; pid++) {
      if (!(await pools.poolFullyRemoved(pid))) {
        const [charityWallet] = await pools.getPoolInfo(pid);
        eligible.push(charityWallet);
      }
    }

    expect(eligible).to.have.length(2);
    expect(eligible).to.include(nonprofit1.address);
    expect(eligible).to.include(nonprofit2.address);  // shutdown but still eligible
    expect(eligible).not.to.include(nonprofit3.address);
  });

  // ── 5. Pre-v9.3 migration assumption (documentation test) ─────────────────
  //
  // On OBN mainnet there are 11 active pools and zero removed pools at the time
  // of the v9.3 deployment. This test documents that assumption by verifying a
  // freshly-initialized v9.3 proxy has no poolFullyRemoved pools.

  it("fresh v9.3 deployment has no poolFullyRemoved pools (documents pre-migration state)", async function () {
    const len = await pools.poolLength();
    for (let pid = 0; pid < len; pid++) {
      expect(await pools.poolFullyRemoved(pid)).to.equal(false,
        `pid ${pid} must not be poolFullyRemoved on a fresh v9.3 deployment`);
    }
  });
});
