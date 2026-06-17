// test/V93ForkMigration.test.js
//
// Mainnet fork migration tests for OBN v9.2 → v9.3 upgrade.
//
// Sections 1–6 (fork tests) require:
//   FORK_MAINNET=true
//   BASE_MAINNET_URL=<alchemy/infura endpoint>
//   FORK_BLOCK_NUMBER=<optional, for reproducibility>
//
// Usage:
//   FORK_MAINNET=true npx hardhat test test/V93ForkMigration.test.js
//
// Section 7 (Non-atomic upgrade gap risk) always runs — no fork required.
// It is a self-contained proof that upgradeToAndCall is mandatory.

"use strict";

const { expect }           = require("chai");
const { ethers, upgrades } = require("hardhat");
const {
  time,
  takeSnapshot,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

// ─── Real Base mainnet addresses ──────────────────────────────────────────────

const OBN_TOKEN        = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685";
const STAKING_PROXY    = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";
const TIMELOCK         = "0x86396526286769ace21982E798Df5eef2389f51c";
const OP_SAFE          = "0x066e2FABb036deab7DC58bAde428F819AC3542DD";
const OLD_TREASURY     = "0x5c8a0acfad4528714076068f71a5ff2ee06c3718";
const OLD_CHARITY_FUND = "0x398fE423a8b4FD9B40CADF8bc72448C95474455F";

// Expected charity wallets per PID (0–10). Used for post-upgrade verification.
// PID 5 is the migrated wallet (0x0A60e...) — verified on-chain during the audit session.
const EXPECTED_CHARITY_WALLETS = [
  "0x750EF1D7a0b4Ab1c97B7A623D7917CcEb5ea779C", // pid 0
  "0xE04063602B8b6B5d3526e6af873d2A4777E12d92", // pid 1
  "0xAB739D4F2B44F3f4ed8236070A8f97119eaEd4aB", // pid 2
  "0x998F25Be40241CA5D8F5fCaF3591B5ED06EF3Be7", // pid 3
  "0x891432Ab6414EFff5d986E14848eCD1e6b2961ae", // pid 4
  "0x0A60e17d5c98D491809CD8A15370C53806EEc1ec", // pid 5 (migrated)
  "0x532Fb5D00f40ced99B16d1E295C77Cda2Eb1BB4F", // pid 6
  "0x92EE2370b56DC32794A6CD72585dC01d4288D314", // pid 7
  "0x718A03C0b38889D57224B5A4eC853953f7B1Aa18", // pid 8
  "0xa23fa5a73C6366f6a829aC1F452A24eFdc5EcFF7", // pid 9
  "0x859D4d3096928048dE53cF256A640aBd428f9bC9", // pid 10
];

// Real non-charity-wallet staker addresses.
// Aim for variety before the fork run — need at least 5 total:
//   ✓ multi-pool staker with claimed rewards (filled below)
//   ✗ single-pool staker          — add from community contacts or frontend tx history
//   ✗ recent depositor            — add from community contacts or frontend tx history
//   ✗ dormant staker (no recent claims, still staking)
//
// To find more candidates (requires Alchemy PAYG or a provider without log-range limits):
//   cast logs "Deposit(address,uint256,uint256)" \
//     --address 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
//     --rpc-url $BASE_MAINNET_URL \
//     --from-block 35165256
//
// Deploy block: 35165256   uniqueStakersGlobal: 191   stakers/pool: 33,18,15,23,24,24,22,25,84,25,11
//
// Section 8 is skipped at runtime if this array is empty.
// Sourced from Dune query 5888061 (updated weekly) + live contract verification.
// All addresses confirmed active (userAmount > 0 in at least one pool) as of 2026-06-11.
const REAL_STAKERS = [
  "0x64c9c9cedc94e58ea9c98f92daf65f19383c5118", // 11-pool,     55k OBN,    2,372 claimed
  "0x32834c56b9647bba7fbe1e6d3fbda9a5d34a487a", //  4-pool, 10,535k OBN,        0 claimed
  "0x65e3419e633833df1d602e7905cb9c7e541f0849", //  2-pool,  7,732k OBN,   52,575 claimed
  "0x3ecc197ac7b63c28a62279c2ebd8e955d2779ef5", //  1-pool,  9,000k OBN,        0 claimed
  "0x94323806d813b6665e0e0fd4c7759fadc983cc51", //  1-pool,  1,445k OBN,   36,424 claimed
  "0x0d7d2c295f48beaa1f7a08dea09bd6dfbe479333", //  1-pool,     10k OBN,        0 claimed
];

const isFork = process.env.FORK_MAINNET === "true";

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Fund an address with 2 ETH and return its signer so it can send transactions.
async function impersonate(address) {
  await ethers.provider.send("hardhat_impersonateAccount", [address]);
  await ethers.provider.send("hardhat_setBalance", [address, "0x1bc16d674ec80000"]);
  return ethers.getSigner(address);
}

// Read all per-pool state for a given PID and its current charity wallet.
async function readPoolState(staking, pid) {
  const [charityWallet, totalStaked] = await staking.getPoolInfo(pid);
  const amount = await staking.userAmount(pid, charityWallet);
  const locked = await staking.lockedAmount(pid, charityWallet);
  const debt   = await staking.userRewardDebt(pid, charityWallet);
  return { charityWallet, totalStaked, amount, locked, debt };
}

// Parse all events from a receipt, silently skipping unknown signatures.
function parseLogs(iface, receipt) {
  return receipt.logs
    .map(l => { try { return iface.parseLog(l); } catch { return null; } })
    .filter(Boolean);
}

// ─── Fork test suite (sections 1–6) ───────────────────────────────────────────
//
// Skipped entirely when FORK_MAINNET is not set.

(isFork ? describe : describe.skip)(
  "V93 Fork Migration (Base mainnet fork)",
  function () {
    this.timeout(600_000); // 10 min — first-run fork RPCs populate the cache

    // Shared state set up in before()
    let staking;          // v9.3 ABI attached to the real STAKING_PROXY
    let token;            // minimal ERC20 ABI for balance reads
    let theOffering, extendOB, governance, lens;
    let timelockSigner;   // impersonated Timelock (proxy owner)
    let owner, voteAdmin; // local Hardhat signers (test accounts)
    let preState;         // state snapshot captured before the upgrade

    // ── One-time setup: deploy, configure, and upgrade ────────────────────────
    before(async function () {
      const signers = await ethers.getSigners();
      owner     = signers[0];
      voteAdmin = signers[1]; // local account used as voteAdmin for governance tests

      // Attach to live proxy with v9.3 ABI (v9.2 proxy responds to all inherited selectors)
      const StakingV93F = await ethers.getContractFactory(
        "contracts/StakingPoolsV93.sol:OBNStakingPools"
      );
      staking = StakingV93F.attach(STAKING_PROXY);

      token = new ethers.Contract(
        OBN_TOKEN,
        ["function balanceOf(address) view returns (uint256)"],
        owner
      );

      // ── Record pre-upgrade state for invariant verification
      preState = {
        version:     await staking.version(),
        treasury:    await staking.treasury(),
        charityFund: await staking.charityFund(),
        globalTotal: await staking.globalTotalStaked(),
        poolLength:  await staking.poolLength(),
        pools:       [],
        // Sample stats fields for PID 0 charity wallet
        claimed0:    await staking.totalClaimedByUser(EXPECTED_CHARITY_WALLETS[0]),
        deposited0:  await staking.totalDepositedByUser(EXPECTED_CHARITY_WALLETS[0]),
      };
      for (let i = 0; i < 11; i++) {
        preState.pools.push(await readPoolState(staking, i));
      }

      // ── Snapshot real stakers before upgrade so section 8 can compare pre/post
      preState.stakers = [];
      for (const addr of REAL_STAKERS) {
        const activePools = [];
        for (let i = 0; i < 11; i++) {
          const amount = await staking.userAmount(i, addr);
          if (amount > 0n) {
            activePools.push({
              pid:          i,
              userAmount:   amount,
              rewardDebt:   await staking.userRewardDebt(i, addr),
              lockedAmount: await staking.lockedAmount(i, addr),
            });
          }
        }
        preState.stakers.push({
          address:        addr,
          activePools,
          totalClaimed:   await staking.totalClaimedByUser(addr),
          totalDeposited: await staking.totalDepositedByUser(addr),
        });
      }

      // ── Deploy new v9.3 contracts in dependency order:
      //    ExtendOliveBranch → TheOffering → AnnualGovernance → V93 implementation

      const EOBFactory = await ethers.getContractFactory("ExtendOliveBranch");
      extendOB = await EOBFactory.deploy(OBN_TOKEN, TIMELOCK);
      await extendOB.waitForDeployment();
      const extendOBAddr = await extendOB.getAddress();

      const TOFactory = await ethers.getContractFactory("TheOffering");
      theOffering = await TOFactory.deploy(OBN_TOKEN, extendOBAddr, TIMELOCK);
      await theOffering.waitForDeployment();
      const offeringAddr = await theOffering.getAddress();

      // voteAdmin is a local Hardhat signer so tests can call startAnnualCycle freely
      const AGFactory = await ethers.getContractFactory("AnnualGovernance");
      governance = await upgrades.deployProxy(AGFactory, [
        OBN_TOKEN,
        STAKING_PROXY,
        offeringAddr,
        extendOBAddr,
        TIMELOCK,
        voteAdmin.address,
        99,
      ], { kind: "uups" });
      await governance.waitForDeployment();
      const govAddr = await governance.getAddress();

      // Bare implementation deploy — NOT a proxy (upgradeToAndCall uses the address)
      const v93Impl = await StakingV93F.deploy();
      await v93Impl.waitForDeployment();
      const v93ImplAddr = await v93Impl.getAddress();

      // ── Impersonate Timelock for all privileged configuration calls
      timelockSigner = await impersonate(TIMELOCK);

      // Whitelist the actual pool charity wallets read from the fork (not hardcoded)
      // so startAnnualCycle's whitelist check passes even if wallets have rotated.
      const actualWallets = [...new Set(preState.pools.map(p => p.charityWallet))];
      for (const wallet of actualWallets) {
        await extendOB.connect(timelockSigner).setApprovedNonprofit(wallet, true);
      }

      // Wire AnnualGovernance into both vaults so Phase 1/2 execution works
      await extendOB.connect(timelockSigner).setGovernance(govAddr);
      await theOffering.connect(timelockSigner).setGovernance(govAddr);

      // ── Atomic upgrade: upgradeToAndCall bundles the upgrade and migrateV93 in
      //    one transaction. This is the ONLY safe upgrade path (see section 7).
      const migrateCalldata = staking.interface.encodeFunctionData("migrateV93", [
        offeringAddr,
        extendOBAddr,
        OP_SAFE,
      ]);
      await staking.connect(timelockSigner).upgradeToAndCall(v93ImplAddr, migrateCalldata);

      // ── Deploy Lens after the upgrade (requires public sumRewardAcrossPhases from v9.3)
      const LensF = await ethers.getContractFactory("OBNStakingLens");
      lens = await upgrades.deployProxy(LensF, [STAKING_PROXY, TIMELOCK], { kind: "uups" });
      await lens.waitForDeployment();
    });

    // Snapshot/restore so every test starts from the same post-upgrade state.
    let snap;
    beforeEach(async function () { snap = await takeSnapshot(); });
    afterEach(async function ()  { await snap.restore(); });

    // ─── 1. Pre-upgrade invariants preserved ─────────────────────────────────

    describe("1. Pre-upgrade invariants preserved", function () {
      it("version is 9.3 after upgrade", async function () {
        expect(await staking.version()).to.equal("9.3");
      });

      it("pool count unchanged", async function () {
        expect(await staking.poolLength()).to.equal(preState.poolLength);
      });

      it("globalTotalStaked unchanged", async function () {
        expect(await staking.globalTotalStaked()).to.equal(preState.globalTotal);
      });

      // Verify all 11 charity wallets match expected values from .env
      for (let i = 0; i < 11; i++) {
        const pid = i;
        it(`PID ${pid} charityWallet matches expected`, async function () {
          const [wallet] = await staking.getPoolInfo(pid);
          expect(wallet.toLowerCase()).to.equal(EXPECTED_CHARITY_WALLETS[pid].toLowerCase());
        });
      }

      it("PID 5 charity wallet is the migrated address 0x0A60e...", async function () {
        const [wallet] = await staking.getPoolInfo(5);
        expect(wallet.toLowerCase()).to.equal("0x0a60e17d5c98d491809cd8a15370c53806eec1ec");
      });

      it("all 11 pool totalStaked values unchanged", async function () {
        for (let i = 0; i < 11; i++) {
          const [, total] = await staking.getPoolInfo(i);
          expect(total).to.equal(preState.pools[i].totalStaked, `PID ${i} totalStaked changed`);
        }
      });

      it("all 11 charity wallet userAmount values unchanged", async function () {
        for (let i = 0; i < 11; i++) {
          const amt = await staking.userAmount(i, preState.pools[i].charityWallet);
          expect(amt).to.equal(preState.pools[i].amount, `PID ${i} userAmount changed`);
        }
      });

      it("all 11 charity wallet lockedAmount unchanged — bootstrap locks preserved", async function () {
        for (let i = 0; i < 11; i++) {
          const wallet = preState.pools[i].charityWallet;
          const locked = await staking.lockedAmount(i, wallet);
          expect(locked).to.equal(preState.pools[i].locked, `PID ${i} lockedAmount changed`);
          expect(locked).to.be.gt(0n, `PID ${i}: lock is zero — was bootstrap not executed?`);
        }
      });

      it("all 11 charity wallet userRewardDebt values unchanged", async function () {
        for (let i = 0; i < 11; i++) {
          const debt = await staking.userRewardDebt(i, preState.pools[i].charityWallet);
          expect(debt).to.equal(preState.pools[i].debt, `PID ${i} rewardDebt changed`);
        }
      });

      it("totalClaimedByUser and totalDepositedByUser unchanged for PID 0 wallet", async function () {
        const w = EXPECTED_CHARITY_WALLETS[0];
        expect(await staking.totalClaimedByUser(w)).to.equal(preState.claimed0);
        expect(await staking.totalDepositedByUser(w)).to.equal(preState.deposited0);
      });
    });

    // ─── 2. Migration state ───────────────────────────────────────────────────

    describe("2. Migration state", function () {
      it("treasury is now TheOffering", async function () {
        expect((await staking.treasury()).toLowerCase())
          .to.equal((await theOffering.getAddress()).toLowerCase());
      });

      it("charityFund is now ExtendOliveBranch", async function () {
        expect((await staking.charityFund()).toLowerCase())
          .to.equal((await extendOB.getAddress()).toLowerCase());
      });

      it("charityFundOperator is the operator Safe", async function () {
        expect((await staking.charityFundOperator()).toLowerCase())
          .to.equal(OP_SAFE.toLowerCase());
      });

      it("upgradeBlock is a non-zero value at or before current block", async function () {
        const ub           = await staking.upgradeBlock();
        const currentBlock = BigInt(await ethers.provider.getBlockNumber());
        expect(ub).to.be.gt(0n);
        expect(ub).to.be.lte(currentBlock);
      });

      it("treasury is no longer the old treasury address", async function () {
        expect((await staking.treasury()).toLowerCase())
          .to.not.equal(OLD_TREASURY.toLowerCase());
      });

      it("charityFund is no longer the old charityFund address", async function () {
        expect((await staking.charityFund()).toLowerCase())
          .to.not.equal(OLD_CHARITY_FUND.toLowerCase());
      });

      it("upgradeBlock > 0 confirms migration ran (_migrationExecuted is private, upgradeBlock is the public signal)", async function () {
        expect(await staking.upgradeBlock()).to.be.gt(0n);
      });

      it("migrateV93 replay is blocked — second call reverts with 'already migrated'", async function () {
        const offeringAddr = await theOffering.getAddress();
        const extendOBAddr = await extendOB.getAddress();
        await expect(
          staking.connect(timelockSigner).migrateV93(offeringAddr, extendOBAddr, OP_SAFE)
        ).to.be.revertedWith("already migrated");
      });
    });

    // ─── 3. Emissions split — new vaults receive 1% each ─────────────────────

    describe("3. Emissions split — new vaults receive 1%", function () {
      it("claimFor routes 1% treasury to TheOffering, not old treasury", async function () {
        await time.increase(3600); // 1 hour ensures non-trivial accrued rewards

        const offeringAddr = await theOffering.getAddress();
        const extendOBAddr = await extendOB.getAddress();

        const before = {
          offering:       await token.balanceOf(offeringAddr),
          extendOB:       await token.balanceOf(extendOBAddr),
          oldTreasury:    await token.balanceOf(OLD_TREASURY),
          oldCharityFund: await token.balanceOf(OLD_CHARITY_FUND),
        };

        // claimFor is onlyOwner in v9.3 — must be called via the Timelock (proxy owner)
        await staking.connect(timelockSigner).claimFor(0, preState.pools[0].charityWallet);

        const after = {
          offering:       await token.balanceOf(offeringAddr),
          extendOB:       await token.balanceOf(extendOBAddr),
          oldTreasury:    await token.balanceOf(OLD_TREASURY),
          oldCharityFund: await token.balanceOf(OLD_CHARITY_FUND),
        };

        // Old addresses must receive nothing after the migration
        expect(after.oldTreasury).to.equal(before.oldTreasury,    "old treasury gained tokens");
        expect(after.oldCharityFund).to.equal(before.oldCharityFund, "old charityFund gained tokens");

        // New vaults must receive their 1% emission slices
        expect(after.offering).to.be.gt(before.offering, "TheOffering received nothing");
        expect(after.extendOB).to.be.gt(before.extendOB, "ExtendOliveBranch received nothing");

        // Both slices are exactly 1% — they must match each other
        const tGain = after.offering - before.offering;
        const fGain = after.extendOB - before.extendOB;
        expect(tGain).to.equal(fGain, "1% treasury and 1% charityFund gains are not equal");
      });

      it("88% staker share and 10% pool charity share are correct proportions", async function () {
        await time.increase(3600);

        const tx = await staking.connect(timelockSigner).claimFor(0, preState.pools[0].charityWallet);
        const receipt = await tx.wait();
        const events  = parseLogs(staking.interface, receipt);

        const claimEv    = events.find(e => e.name === "Claim");
        const charityEv  = events.find(e => e.name === "CharityDistributed");
        const treasuryEv = events.find(e => e.name === "TreasuryDistributed");
        const cfEv       = events.find(e => e.name === "CharityFundDistributed");

        expect(claimEv,    "Claim event missing").to.not.be.null;
        expect(charityEv,  "CharityDistributed event missing").to.not.be.null;
        expect(treasuryEv, "TreasuryDistributed event missing").to.not.be.null;
        expect(cfEv,       "CharityFundDistributed event missing").to.not.be.null;

        const userShare    = claimEv.args[2];   // 88% of gross
        const charityShare = charityEv.args[1]; // 10% of gross
        const tShare       = treasuryEv.args[0]; // 1% of gross
        const fShare       = cfEv.args[0];       // 1% of gross

        // 88% : 10% ratio — allow ±1 for integer rounding
        expect(userShare).to.be.gte(charityShare * 8n);
        expect(userShare).to.be.lte(charityShare * 9n + 1n);
        // 10% : 1% ratio
        expect(charityShare).to.be.gte(tShare * 9n);
        expect(charityShare).to.be.lte(tShare * 11n + 1n);
        // Both 1% slices must be identical
        expect(tShare).to.equal(fShare, "1% treasury != 1% charityFund");
      });

      it("10% pool charity is minted to the correct pool charityWallet", async function () {
        await time.increase(3600);

        const pid    = 2; // use PID 2 to avoid pid 0 charity-wallet == staker overlap
        const staker = preState.pools[pid].charityWallet;

        const tx = await staking.connect(timelockSigner).claimFor(pid, staker);
        const receipt = await tx.wait();
        const events  = parseLogs(staking.interface, receipt);

        const charityEv = events.find(e => e.name === "CharityDistributed");
        expect(charityEv, "CharityDistributed event missing").to.not.be.null;
        expect(charityEv.args[0]).to.equal(BigInt(pid));
        expect(charityEv.args[1]).to.be.gt(0n);
      });
    });

    // ─── 4. Lazy bootstrap ───────────────────────────────────────────────────

    describe("4. Lazy bootstrap", function () {
      it("all 11 real stakers have checkpointCount == 0 immediately after upgrade", async function () {
        for (const pool of preState.pools) {
          expect(await staking.checkpointCount(pool.charityWallet)).to.equal(
            0n, `${pool.charityWallet} unexpectedly already has a checkpoint`
          );
        }
      });

      it("castOfferingVote auto-bootstraps a staker with zero checkpoints", async function () {
        const staker = preState.pools[0].charityWallet;

        // Advance one block so snapshotBlock is strictly in the past
        await ethers.provider.send("hardhat_mine", ["0x1"]);
        await governance.connect(voteAdmin).startAnnualCycle(7n * 86400n, 7n * 86400n);
        const cycleId = await governance.currentCycleId();

        // Confirm uninitialized before vote
        expect(await staking.checkpointCount(staker)).to.equal(0n);

        const stakerSigner = await impersonate(staker);
        await governance.connect(stakerSigner).castOfferingVote(cycleId, true); // vote BURN

        // Auto-bootstrap wrote the genesis checkpoint
        expect(await staking.checkpointCount(staker)).to.equal(1n);
      });

      it("voting power after lazy bootstrap equals actual total staked balance at snapshot", async function () {
        const staker = preState.pools[0].charityWallet;

        await ethers.provider.send("hardhat_mine", ["0x1"]);
        await governance.connect(voteAdmin).startAnnualCycle(7n * 86400n, 7n * 86400n);
        const cycleId = await governance.currentCycleId();
        const summary = await governance.getCycleSummary(cycleId);
        const snapshotBlock = BigInt(summary.snapshotBlock);

        const stakerSigner = await impersonate(staker);
        await governance.connect(stakerSigner).castOfferingVote(cycleId, false); // vote GIVE

        // Bootstrap writes a checkpoint at upgradeBlock. getPastVotingPower at snapshotBlock
        // uses upperLookup, which resolves to the upgradeBlock value (since snapshotBlock > upgradeBlock
        // and no later checkpoint exists yet).
        const totalStaked = await staking.totalStakedByUser(staker);
        const votingPower = await staking.getPastVotingPower(staker, snapshotBlock);

        expect(totalStaked).to.be.gt(0n, "totalStakedByUser should be non-zero after bootstrap");
        expect(votingPower).to.equal(totalStaked, "voting power should equal total staked at snapshot");
      });
    });

    // ─── 5. executeCurrentCycle ───────────────────────────────────────────────

    describe("5. executeCurrentCycle", function () {
      let cycleId;

      // Each test gets a fresh cycle (snapshot/restore by outer beforeEach/afterEach).
      beforeEach(async function () {
        await ethers.provider.send("hardhat_mine", ["0x1"]);
        await governance.connect(voteAdmin).startAnnualCycle(7n * 86400n, 7n * 86400n);
        cycleId = await governance.currentCycleId();
      });

      it("executes Phase 1 when cycle is PHASE1_READY", async function () {
        await time.increase(7 * 86400 + 1);
        expect(await governance.getCycleState(cycleId)).to.equal(2n); // PHASE1_READY

        await expect(governance.executeCurrentCycle())
          .to.emit(governance, "Phase1Executed");
      });

      it("executes Phase 2 when cycle is PHASE2_READY", async function () {
        await time.increase(7 * 86400 + 1);
        await governance.executeCurrentCycle(); // Phase 1

        await time.increase(7 * 86400 + 1);
        expect(await governance.getCycleState(cycleId)).to.equal(4n); // PHASE2_READY

        // No votes cast → zero participation → Phase2RolledOver
        await expect(governance.executeCurrentCycle())
          .to.emit(governance, "Phase2RolledOver");
      });

      it("new cycle can start immediately after current cycle reaches COMPLETED", async function () {
        await time.increase(7 * 86400 + 1);
        await governance.executeCurrentCycle(); // Phase 1

        await time.increase(7 * 86400 + 1);
        await governance.executeCurrentCycle(); // Phase 2

        expect(await governance.getCycleState(cycleId)).to.equal(5n); // COMPLETED

        await ethers.provider.send("hardhat_mine", ["0x1"]);
        await expect(
          governance.connect(voteAdmin).startAnnualCycle(7n * 86400n, 7n * 86400n)
        ).to.not.be.reverted;

        expect(await governance.currentCycleId()).to.equal(cycleId + 1n);
      });

      it("executeCurrentCycle reverts when cycle is PHASE1_OPEN (not ready)", async function () {
        // Just started — time has not advanced past phase1End
        expect(await governance.getCycleState(cycleId)).to.equal(1n); // PHASE1_OPEN

        await expect(governance.executeCurrentCycle())
          .to.be.revertedWith("cycle not ready for execution");
      });
    });

    // ─── 6. Lens reads — value-for-value validation ───────────────────────────
    //
    // Every Lens function is validated field-by-field against direct proxy reads.
    // Where two Lens functions share the same formula (pendingRewards /
    // getUserPoolView.pending), they are also cross-validated against each other.

    describe("6. Lens reads — value-for-value validation", function () {
      const pid  = 0;
      const user = EXPECTED_CHARITY_WALLETS[0];

      it("pendingRewards matches getUserPoolView.pending — same formula, same block", async function () {
        await time.increase(3600);
        const standalone = await lens.pendingRewards(pid, user);
        const view       = await lens.getUserPoolView(pid, user);
        expect(standalone).to.equal(view.pending,
          "pendingRewards and getUserPoolView.pending diverged — Lens formula inconsistency");
        expect(standalone).to.be.gt(0n, "no rewards accrued — staker may be inactive");
      });

      it("pendingRewardsMultiple: sum equals total AND each entry matches pendingRewards", async function () {
        await time.increase(3600);
        const allPids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const result  = await lens.pendingRewardsMultiple(allPids, user);
        const summed  = result.pendings.reduce((a, b) => a + b, 0n);
        expect(summed).to.equal(result.total, "sum of per-pid pendings != reported total");

        for (let i = 0; i < allPids.length; i++) {
          const standalone = await lens.pendingRewards(allPids[i], user);
          expect(result.pendings[i]).to.equal(standalone,
            `pendingRewardsMultiple[${allPids[i]}] != pendingRewards(${allPids[i]})`);
        }
      });

      it("getPoolAPR is positive for all 11 active pools, zero for any zero-stake pool", async function () {
        const poolLen = await staking.poolLength();
        for (let i = 0; i < Number(poolLen); i++) {
          const [, totalStaked] = await staking.getPoolInfo(i);
          const apr = await lens.getPoolAPR(i);
          if (totalStaked === 0n) {
            expect(apr).to.equal(0n, `PID ${i}: no stake but non-zero APR`);
          } else {
            expect(apr).to.be.gt(0n, `PID ${i}: has ${totalStaked} staked but zero APR`);
          }
        }
      });

      it("getUserStats fields match direct proxy storage reads field-by-field", async function () {
        const stats = await lens.getUserStats(user);

        expect(stats.totalUserClaimed).to.equal(await staking.totalClaimedByUser(user));
        expect(stats.totalUserDeposited).to.equal(await staking.totalDepositedByUser(user));
        expect(stats.totalUserWithdrawn).to.equal(await staking.totalWithdrawnByUser(user));

        // totalUserStaked and poolCount are computed by iterating pools — reproduce manually
        let expectedStaked = 0n;
        let expectedCount  = 0n;
        const poolLen = await staking.poolLength();
        for (let i = 0; i < Number(poolLen); i++) {
          const amt = await staking.userAmount(i, user);
          if (amt > 0n) { expectedStaked += amt; expectedCount++; }
        }
        expect(stats.totalUserStaked).to.equal(expectedStaked, "totalUserStaked mismatch");
        expect(stats.poolCount).to.equal(expectedCount,        "poolCount mismatch");
      });

      it("getPoolStats fields match direct proxy storage reads field-by-field", async function () {
        const stats    = await lens.getPoolStats(pid);
        const [cw, ts] = await staking.getPoolInfo(pid);

        expect(stats.charityWallet.toLowerCase()).to.equal(cw.toLowerCase());
        expect(stats.totalStaked).to.equal(ts);
        expect(stats.uniqueStakers).to.equal(await staking.uniqueStakersByPool(pid));
        expect(stats.accPerShare).to.equal(await staking.accRewardPerShare(pid));
        expect(stats.lastTime).to.equal(await staking.lastRewardTime(pid));
        expect(stats.accruedCharity).to.equal(await staking.charityAccrued(pid));
        expect(stats.depositedAllTime).to.equal(await staking.totalDepositedByPool(pid));
        expect(stats.withdrawnAllTime).to.equal(await staking.totalWithdrawnByPool(pid));
        expect(stats.charityMintedAllTime).to.equal(await staking.totalCharityMintedByPool(pid));
      });

      it("getUserPoolView fields match direct proxy reads; pending == pendingRewards", async function () {
        await time.increase(3600);
        const view    = await lens.getUserPoolView(pid, user);
        const staked  = await staking.userAmount(pid, user);
        const locked  = await staking.lockedAmount(pid, user);
        const debt    = await staking.userRewardDebt(pid, user);
        const clamp   = locked > staked ? staked : locked;

        expect(view.staked).to.equal(staked);
        expect(view.locked).to.equal(clamp);
        expect(view.unlocked).to.equal(staked - clamp);
        expect(view.rewardDebt).to.equal(debt);
        expect(view.isActive).to.equal(staked > 0n);
        expect(view.pending).to.equal(await lens.pendingRewards(pid, user),
          "getUserPoolView.pending != pendingRewards — formula diverged");
        expect(view.pending).to.be.gt(0n, "no rewards accrued — staker may be inactive");
      });

      it("getGlobalStats fields match direct proxy reads field-by-field", async function () {
        const g = await lens.getGlobalStats();
        expect(g.poolCount).to.equal(await staking.poolLength());
        expect(g.totalStaked_).to.equal(await staking.globalTotalStaked());
        expect(g.uniqueStakers_).to.equal(await staking.uniqueStakersGlobal());
        expect(g.rps).to.equal(await staking.currentRewardsPerSecond());
      });

      it("pendingCharityFor matches charityAccrued on proxy for all 11 pools", async function () {
        const poolLen = await staking.poolLength();
        for (let i = 0; i < Number(poolLen); i++) {
          expect(await lens.pendingCharityFor(i)).to.equal(
            await staking.charityAccrued(i), `PID ${i} charityAccrued mismatch`
          );
        }
      });

      it("listPoolsBasic wallets, totals, uniqueCounts match direct proxy reads for all 11 pools", async function () {
        const result  = await lens.listPoolsBasic();
        const poolLen = Number(await staking.poolLength());
        expect(result.charityWallets.length).to.equal(poolLen);
        for (let i = 0; i < poolLen; i++) {
          const [cw, ts] = await staking.getPoolInfo(i);
          const uniq     = await staking.uniqueStakersByPool(i);
          expect(result.charityWallets[i].toLowerCase()).to.equal(cw.toLowerCase(), `PID ${i} charityWallet`);
          expect(result.totals[i]).to.equal(ts,                                     `PID ${i} totalStaked`);
          expect(result.uniqueCounts[i]).to.equal(uniq,                             `PID ${i} uniqueStakers`);
        }
      });
    });
    // ─── 8. Real user sampling ───────────────────────────────────────────────
    //
    // Verifies that the upgrade does not corrupt any normal staker's state.
    // Populate REAL_STAKERS at the top of this file with 5-10 addresses
    // drawn from on-chain Deposit events before running the fork test.
    // This section is skipped at runtime if REAL_STAKERS is empty.

    describe("8. Real user sampling", function () {
      before(function () {
        if (REAL_STAKERS.length === 0) {
          console.warn(
            "\n  ⚠️  REAL_STAKERS is empty — section 8 skipped.\n" +
            "     Populate REAL_STAKERS in V93ForkMigration.test.js before\n" +
            "     running the final fork validation.\n"
          );
          this.skip();
        }
      });

      it("all REAL_STAKERS have at least one active pool (sanity check)", async function () {
        for (const s of preState.stakers) {
          expect(s.activePools.length).to.be.gte(1,
            `${s.address} has no active pools — not a staker or address wrong`);
        }
      });

      it("upgrade preserves userAmount for all REAL_STAKERS across every active pool", async function () {
        for (const s of preState.stakers) {
          for (const pool of s.activePools) {
            const post = await staking.userAmount(pool.pid, s.address);
            expect(post).to.equal(pool.userAmount,
              `${s.address} PID ${pool.pid}: userAmount changed by upgrade`);
          }
        }
      });

      it("upgrade preserves rewardDebt for all REAL_STAKERS", async function () {
        for (const s of preState.stakers) {
          for (const pool of s.activePools) {
            const post = await staking.userRewardDebt(pool.pid, s.address);
            expect(post).to.equal(pool.rewardDebt,
              `${s.address} PID ${pool.pid}: rewardDebt changed by upgrade`);
          }
        }
      });

      it("upgrade preserves lockedAmount for all REAL_STAKERS", async function () {
        for (const s of preState.stakers) {
          for (const pool of s.activePools) {
            const post = await staking.lockedAmount(pool.pid, s.address);
            expect(post).to.equal(pool.lockedAmount,
              `${s.address} PID ${pool.pid}: lockedAmount changed by upgrade`);
          }
        }
      });

      it("upgrade preserves totalClaimedByUser for all REAL_STAKERS", async function () {
        for (const s of preState.stakers) {
          const post = await staking.totalClaimedByUser(s.address);
          expect(post).to.equal(s.totalClaimed,
            `${s.address}: totalClaimedByUser changed by upgrade`);
        }
      });

      it("upgrade preserves totalDepositedByUser for all REAL_STAKERS", async function () {
        for (const s of preState.stakers) {
          const post = await staking.totalDepositedByUser(s.address);
          expect(post).to.equal(s.totalDeposited,
            `${s.address}: totalDepositedByUser changed by upgrade`);
        }
      });

      it("Lens.pendingRewards is non-zero for each REAL_STAKER's active pool after 1 hour", async function () {
        await time.increase(3600);
        for (const s of preState.stakers) {
          for (const pool of s.activePools) {
            const pending = await lens.pendingRewards(pool.pid, s.address);
            expect(pending).to.be.gt(0n,
              `${s.address} PID ${pool.pid}: no pending rewards after 1 hour`);
          }
        }
      });

      it("Lens.getUserStats poolCount matches pre-upgrade active pool count for all REAL_STAKERS", async function () {
        for (const s of preState.stakers) {
          const stats = await lens.getUserStats(s.address);
          expect(stats.poolCount).to.equal(BigInt(s.activePools.length),
            `${s.address}: poolCount mismatch post-upgrade`);
        }
      });

      it("Lens.getUserStats totalUserClaimed matches staking.totalClaimedByUser for all REAL_STAKERS", async function () {
        for (const s of preState.stakers) {
          const stats  = await lens.getUserStats(s.address);
          const direct = await staking.totalClaimedByUser(s.address);
          expect(stats.totalUserClaimed).to.equal(direct,
            `${s.address}: Lens.getUserStats.totalUserClaimed != staking.totalClaimedByUser`);
        }
      });
    });

    // ─── 9. Emission fallback — 3% perpetual rate after all phases exhaust ───────
    //
    // Verifies that FALLBACK_EMISSION_BPS (300 / 3%) fires once all defined phases
    // are exhausted, that the rate differs from the final phase rate (125 / 1.25%),
    // and that governance can override it at any time via addPhase().

    describe("9. Emission fallback — 3% perpetual rate post-phase-exhaustion", function () {
      it("currentRewardsPerSecond equals FALLBACK_EMISSION_BPS (300) after last phase ends", async function () {
        const lastPhase = await staking.phases(4);
        await time.increaseTo(Number(lastPhase.end) + 1);

        const rps = await staking.currentRewardsPerSecond();
        expect(rps).to.be.gt(0n, "rewards dropped to zero after phases — fallback not firing");

        const globalStaked = await staking.globalTotalStaked();
        const FALLBACK_BPS = await staking.FALLBACK_EMISSION_BPS();
        const denom = 10000n * BigInt(365 * 24 * 3600);

        // mulDiv exact: allow ±1 wei
        const expectedFallback   = (globalStaked * FALLBACK_BPS) / denom;
        const expectedLastPhase  = (globalStaked * 125n) / denom;

        expect(rps).to.be.gte(expectedFallback  - 1n);
        expect(rps).to.be.lte(expectedFallback  + 1n);
        expect(rps).to.not.equal(expectedLastPhase, "rate matches last-phase BPS (125) — should use FALLBACK (300)");
      });

      it("sumRewardAcrossPhases accrues at 3% per year strictly within the fallback period", async function () {
        const lastPhase  = await staking.phases(4);
        const afterEnd   = lastPhase.end + 1n;
        const oneYear    = BigInt(365 * 24 * 3600);
        const poolStake  = (await staking.getPoolInfo(0))[1];

        const reward = await staking.sumRewardAcrossPhases(afterEnd, afterEnd + oneYear, poolStake);

        // mulDiv(poolStake, 300 * 365days, 10000 * 365days) = poolStake * 300 / 10000
        const FALLBACK_BPS = await staking.FALLBACK_EMISSION_BPS();
        const TOTAL_BPS    = await staking.TOTAL_BPS();
        const expected     = (poolStake * FALLBACK_BPS) / TOTAL_BPS;

        expect(reward).to.be.gt(0n, "no reward in fallback period");
        expect(reward).to.be.gte(expected - 1n);
        expect(reward).to.be.lte(expected + 1n);
      });

      it("sumRewardAcrossPhases for window spanning phase boundary: phase part + fallback part", async function () {
        const lastPhase  = await staking.phases(4);
        const thirtyDays = BigInt(30 * 24 * 3600);
        const winStart   = lastPhase.end - thirtyDays;
        const winEnd     = lastPhase.end + thirtyDays;
        const poolStake  = (await staking.getPoolInfo(0))[1];

        const reward = await staking.sumRewardAcrossPhases(winStart, winEnd, poolStake);

        const denom       = 10000n * BigInt(365 * 24 * 3600);
        const phasePart   = (poolStake * 125n * thirtyDays) / denom;   // last phase: 1.25%
        const fallbackPart = (poolStake * 300n * thirtyDays) / denom;  // fallback:   3%
        const expected    = phasePart + fallbackPart;

        expect(reward).to.be.gt(phasePart,      "fallback segment not added");
        expect(reward).to.be.gte(expected - 2n); // ±2 for two separate mulDiv ops
        expect(reward).to.be.lte(expected + 2n);
      });

      it("addPhase after exhaustion immediately overrides the fallback rate", async function () {
        const lastPhase = await staking.phases(4);
        await time.increaseTo(Number(lastPhase.end) + 1);

        const rpsAtFallback = await staking.currentRewardsPerSecond();

        const nowTs  = BigInt(await time.latest());
        const newEnd = nowTs + BigInt(365 * 24 * 3600);
        await staking.connect(timelockSigner).addPhase(nowTs, newEnd, 500n); // 5%

        await time.increase(1);
        const rpsNewPhase = await staking.currentRewardsPerSecond();

        const globalStaked   = await staking.globalTotalStaked();
        const denom          = 10000n * BigInt(365 * 24 * 3600);
        const expectedNewBps = (globalStaked * 500n) / denom;

        expect(rpsNewPhase).to.not.equal(rpsAtFallback, "addPhase did not override fallback rate");
        expect(rpsNewPhase).to.be.gte(expectedNewBps - 1n);
        expect(rpsNewPhase).to.be.lte(expectedNewBps + 1n);
      });
    });
  }
);

// ─── 7. Non-atomic upgrade gap risk (always runs — no fork required) ──────────
//
// Proves that upgradeToAndCall is MANDATORY for the v9.2 → v9.3 upgrade.
//
// The vulnerability (H3 severity):
//   If the upgrade and migrateV93 are split into two separate transactions,
//   any deposit made in the gap window (after upgrade, before migrateV93) will:
//   1. Skip _initializeCheckpointIfNeeded because upgradeBlock == 0
//   2. Set totalStakedByUser to only the gap deposit amount (not pre-upgrade balance)
//   3. Write a checkpoint, permanently blocking future bootstrapCheckpoint calls
//
//   After migrateV93 is called, _initializeCheckpointIfNeeded sees an existing checkpoint
//   and does nothing. totalStakedByUser remains undercounted.
//
//   Any attempt to withdraw the pre-upgrade balance then reverts with arithmetic underflow:
//   totalStakedByUser[user] -= amount   →   (gapAmount) - (preAmount + gapAmount)   →   PANIC
//
//   The pre-upgrade stake is permanently locked — inaccessible to the staker.
//   forceExitUserToSelf is the only admin recovery path.

describe("7. Non-atomic upgrade gap risk (always runs)", function () {
  // Fixture: fresh v9.2 deployment → pre-upgrade deposit → split upgrade → gap deposit → migrateV93
  async function gapRiskFixture() {
    const [owner, charity, treasury, charityFund, staker] = await ethers.getSigners();

    const OBNToken = await ethers.getContractFactory("OBNToken");
    const token    = await upgrades.deployProxy(OBNToken, [
      owner.address,
      ethers.parseEther("1000000000"),
      owner.address, owner.address, owner.address, owner.address, owner.address,
    ], { kind: "uups" });
    await token.waitForDeployment();
    // Do NOT call setMinterOnce here — the proxy must be the minter so _mintSlices works.
    // owner.address receives 100% of initialSupply (passed as all 5 distribution addresses).

    // Deploy v9.2 StakingPools as UUPS proxy
    const PoolsV92 = await ethers.getContractFactory("contracts/StakingPools.sol:OBNStakingPools");
    const proxy    = await upgrades.deployProxy(PoolsV92, [
      await token.getAddress(), treasury.address, charityFund.address,
    ], { kind: "uups" });
    await proxy.waitForDeployment();
    await proxy.addPool(charity.address); // pid 0

    const preAmount = ethers.parseEther("5000");
    const gapAmount = ethers.parseEther("1000");
    // Transfer from owner's initial allocation (no mint needed; owner holds all supply).
    await token.transfer(staker.address, preAmount + gapAmount);
    // Set the proxy as the sole minter so _mintSlices can emit reward slices.
    await token.setMinterOnce(await proxy.getAddress());
    await token.connect(staker).approve(await proxy.getAddress(), ethers.MaxUint256);

    // PRE-UPGRADE: staker deposits 5,000 OBN in pool 0.
    // v9.2 has no totalStakedByUser — this slot is zero in the implementation.
    await proxy.connect(staker).deposit(0, preAmount);

    // SPLIT UPGRADE — the dangerous path: upgrade implementation only, no migrateV93.
    // upgradeBlock stays 0 after this call.
    const PoolsV93 = await ethers.getContractFactory("contracts/StakingPoolsV93.sol:OBNStakingPools");
    const v93Impl  = await PoolsV93.deploy();
    await v93Impl.waitForDeployment();
    await proxy.upgradeToAndCall(await v93Impl.getAddress(), "0x"); // empty data: upgrade only

    const stakingV93 = PoolsV93.attach(await proxy.getAddress());

    // GAP WINDOW DEPOSIT: staker deposits 1,000 more while upgradeBlock == 0.
    //
    // Inside _depositCore → _initializeCheckpointIfNeeded:
    //   if (upgradeBlock == 0) return;   ← no-op, skips genesis initialization
    //
    // Then unconditionally:
    //   totalStakedByUser[staker] += 1000   →  0 + 1000 = 1000   (missing the 5000 pre-upgrade!)
    //   _stakeCheckpoints[staker].push(block, 1000)               (checkpoint now exists)
    //
    await stakingV93.connect(staker).deposit(0, gapAmount);

    // SEPARATE migrateV93: sets upgradeBlock, but it's too late.
    // _initializeCheckpointIfNeeded will now see an existing checkpoint and stay a no-op forever.
    await stakingV93.migrateV93(treasury.address, charityFund.address, owner.address);

    // State after fixture:
    //   userAmount[0][staker]      = 6000  (correct total in staking accounting)
    //   totalStakedByUser[staker]  = 1000  (CORRUPTED — only gap amount tracked)
    //   checkpointCount[staker]    = 1     (blocks bootstrapCheckpoint recovery)
    //   upgradeBlock               > 0    (migration executed)

    return { stakingV93, token, staker, preAmount, gapAmount };
  }

  it("totalStakedByUser is corrupted: tracked balance < actual userAmount balance", async function () {
    const { stakingV93, staker, preAmount, gapAmount } = await loadFixture(gapRiskFixture);

    const tracked = await stakingV93.totalStakedByUser(staker.address);
    const actual  = await stakingV93.userAmount(0, staker.address);

    expect(tracked).to.equal(gapAmount,            "totalStakedByUser should only show gap deposit");
    expect(actual).to.equal(preAmount + gapAmount, "userAmount should show full pre+gap balance");
    expect(tracked).to.be.lt(actual,               "tracked < actual confirms corruption");
  });

  it("bootstrapCheckpoint cannot fix the corruption — it reverts because a checkpoint exists", async function () {
    const { stakingV93, staker } = await loadFixture(gapRiskFixture);

    // The gap deposit wrote a checkpoint, so bootstrapCheckpoint's guard fires
    expect(await stakingV93.checkpointCount(staker.address)).to.equal(1n);

    await expect(
      stakingV93.bootstrapCheckpoint(staker.address)
    ).to.be.revertedWith("already initialized");
  });

  it("withdrawing the gap amount alone succeeds (no underflow for gapAmount)", async function () {
    const { stakingV93, staker, preAmount, gapAmount } = await loadFixture(gapRiskFixture);

    // totalStakedByUser[staker] = 1000; withdraw 1000 → 0 (no underflow)
    await expect(
      stakingV93.connect(staker).withdraw(0, gapAmount)
    ).to.not.be.reverted;

    // After gap withdrawal the pre-upgrade stake is fully trapped:
    //   totalStakedByUser[staker] = 0
    //   userAmount[0][staker]     = 5000  (still there, now permanently inaccessible)
    expect(await stakingV93.totalStakedByUser(staker.address)).to.equal(0n);
    expect(await stakingV93.userAmount(0, staker.address)).to.equal(preAmount);
  });

  it("withdrawing any pre-upgrade stake after the gap amount reverts with arithmetic underflow", async function () {
    const { stakingV93, staker, gapAmount } = await loadFixture(gapRiskFixture);

    // Drain totalStakedByUser to 0 first
    await stakingV93.connect(staker).withdraw(0, gapAmount);

    // Now totalStakedByUser[staker] == 0.
    // Any withdrawal: totalStakedByUser[staker] -= amount → 0 - 1 → arithmetic underflow → PANIC
    await expect(
      stakingV93.connect(staker).withdraw(0, 1n)
    ).to.be.reverted; // Solidity 0.8+ checked arithmetic: panic code 0x11
  });

  it("full withdrawal in one transaction reverts — atomic upgradeToAndCall is mandatory", async function () {
    const { stakingV93, staker, preAmount, gapAmount } = await loadFixture(gapRiskFixture);

    // _loadAndCheckWithdraw:  userAmount[0][staker] = 6000 >= 6000  ✓  (no lock, passes)
    // _initializeCheckpointIfNeeded: checkpoint exists  →  no-op
    // totalStakedByUser[staker] -= 6000  →  1000 - 6000  →  arithmetic underflow  →  REVERT
    //
    // The entire transaction reverts, including any token transfers or mints that
    // executed before line 832. Staker's 6000 OBN is permanently locked in the contract.
    await expect(
      stakingV93.connect(staker).withdraw(0, preAmount + gapAmount)
    ).to.be.reverted;
  });
});

// ─── 10. Emission fallback — isolated unit tests (always runs — no fork required) ──
//
// Proves FALLBACK_EMISSION_BPS logic in isolation using a fresh minimal deployment.
// Does not require BASE_MAINNET_URL. Runs in plain `npx hardhat test`.

describe("10. Emission fallback — minimal fixture (no fork required)", function () {

  async function fallbackMinimalFixture() {
    const [owner, charity, treasury, charityFund, staker] = await ethers.getSigners();

    const OBNTokenF = await ethers.getContractFactory("OBNToken");
    const token = await upgrades.deployProxy(OBNTokenF, [
      owner.address,
      ethers.parseEther("1000000000"),
      owner.address, owner.address, owner.address, owner.address, owner.address,
    ], { kind: "uups" });
    await token.waitForDeployment();

    const PoolsV92 = await ethers.getContractFactory("contracts/StakingPools.sol:OBNStakingPools");
    const proxy = await upgrades.deployProxy(PoolsV92, [
      await token.getAddress(), treasury.address, charityFund.address,
    ], { kind: "uups" });
    await proxy.waitForDeployment();
    await proxy.addPool(charity.address);

    const stakeAmount = ethers.parseEther("10000");
    await token.transfer(staker.address, stakeAmount);
    await token.setMinterOnce(await proxy.getAddress());
    await token.connect(staker).approve(await proxy.getAddress(), ethers.MaxUint256);
    await proxy.connect(staker).deposit(0, stakeAmount);

    const EOBFactory = await ethers.getContractFactory("ExtendOliveBranch");
    const extendOB = await EOBFactory.deploy(await token.getAddress(), owner.address);
    await extendOB.waitForDeployment();

    const TOFactory = await ethers.getContractFactory("TheOffering");
    const theOffering = await TOFactory.deploy(
      await token.getAddress(), await extendOB.getAddress(), owner.address
    );
    await theOffering.waitForDeployment();

    const PoolsV93 = await ethers.getContractFactory("contracts/StakingPoolsV93.sol:OBNStakingPools");
    const v93Impl = await PoolsV93.deploy();
    await v93Impl.waitForDeployment();

    const stakingV93 = PoolsV93.attach(await proxy.getAddress());
    const migrateCalldata = stakingV93.interface.encodeFunctionData("migrateV93", [
      await theOffering.getAddress(),
      await extendOB.getAddress(),
      owner.address,
    ]);
    await proxy.upgradeToAndCall(await v93Impl.getAddress(), migrateCalldata);

    const lastPhase = await stakingV93.phases(4);
    const poolStake = (await stakingV93.getPoolInfo(0))[1];
    return { stakingV93, token, staker, stakeAmount, poolStake, lastPhase, owner };
  }

  it("sumRewardAcrossPhases returns 3%-per-year in a window fully inside the fallback period", async function () {
    const { stakingV93, poolStake, lastPhase } = await loadFixture(fallbackMinimalFixture);

    const afterEnd = lastPhase.end + 1n;
    const oneYear  = BigInt(365 * 24 * 3600);

    const reward = await stakingV93.sumRewardAcrossPhases(afterEnd, afterEnd + oneYear, poolStake);

    // mulDiv(poolStake, 300 * 365days, 10000 * 365days) = poolStake * 300 / 10000
    const FALLBACK_BPS = await stakingV93.FALLBACK_EMISSION_BPS();
    const TOTAL_BPS    = await stakingV93.TOTAL_BPS();
    const expected     = (poolStake * FALLBACK_BPS) / TOTAL_BPS;

    expect(reward).to.be.gt(0n, "no reward in fallback period");
    expect(reward).to.be.gte(expected - 1n);
    expect(reward).to.be.lte(expected + 1n);
  });

  it("sumRewardAcrossPhases returns correct phase rate for a window inside an active phase", async function () {
    const { stakingV93, poolStake, lastPhase } = await loadFixture(fallbackMinimalFixture);

    // Phase 0: 10% BPS, window = 30 days starting right at phase 0 start
    const phase0    = await stakingV93.phases(0);
    const thirtyDays = BigInt(30 * 24 * 3600);
    const reward    = await stakingV93.sumRewardAcrossPhases(phase0.start, phase0.start + thirtyDays, poolStake);

    const denom      = 10000n * BigInt(365 * 24 * 3600);
    const expected   = (poolStake * 1000n * thirtyDays) / denom;

    expect(reward).to.be.gt(0n);
    expect(reward).to.be.gte(expected - 1n);
    expect(reward).to.be.lte(expected + 1n);
    // Confirm fallback (300 bps) is NOT used — phase 0 uses 1000 bps
    const fallbackExpected = (poolStake * 300n * thirtyDays) / denom;
    expect(reward).to.not.equal(fallbackExpected, "fallback BPS used inside an active phase");
  });

  it("currentRewardsPerSecond uses FALLBACK_EMISSION_BPS (not last-phase BPS) after 10 years", async function () {
    const { stakingV93, lastPhase } = await loadFixture(fallbackMinimalFixture);

    await time.increaseTo(Number(lastPhase.end) + 1);
    const rps = await stakingV93.currentRewardsPerSecond();

    expect(rps).to.be.gt(0n, "currentRewardsPerSecond dropped to 0 — fallback not firing");

    const globalStaked     = await stakingV93.globalTotalStaked();
    const denom            = 10000n * BigInt(365 * 24 * 3600);
    const expectedFallback = (globalStaked * 300n) / denom;  // 3%
    const expectedLast     = (globalStaked * 125n) / denom;  // 1.25%

    expect(rps).to.be.gte(expectedFallback - 1n);
    expect(rps).to.be.lte(expectedFallback + 1n);
    expect(rps).to.not.equal(expectedLast, "rps matches last-phase BPS — FALLBACK_EMISSION_BPS not used");
  });
});
