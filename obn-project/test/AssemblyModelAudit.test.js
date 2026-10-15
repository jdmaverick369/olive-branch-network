const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { mine } = require('@nomicfoundation/hardhat-network-helpers');

// Deterministic model checks: useful adversarial coverage, not exhaustive verification.
describe('OliveAssembly custody and checkpoint model audit', function () {
  this.timeout(180000);
  for (const seed of [0x12345678, 0xdeadbeef, 0x10203040]) {
    it(`preserves custody, unique registration and historical counts through 160 mixed operations (seed ${seed})`, async function () {
      const [owner, outsider, ...all] = await ethers.getSigners();
      const users = all.slice(0, 6);
      const nft = await (await ethers.getContractFactory('OliveNFT')).deploy('Olive', 'OLIVE', '');
      const assembly = await upgrades.deployProxy(await ethers.getContractFactory('OliveAssembly'), [nft.target, owner.address], { kind: 'uups' });
      const holders = new Map(); // participant index, -1 registered custody, -2 unregistered custody
      const registered = Array(6).fill(0);
      for (let i = 0; i < users.length; i++) {
        await nft.ownerMint(users[i].address, 3);
        await nft.connect(users[i]).setApprovalForAll(assembly.target, true);
        for (let token = i * 3 + 1; token <= i * 3 + 3; token++) holders.set(token, i);
      }
      let randomState = seed >>> 0;
      function next(n) { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState % n; }
      const snapshots = [];
      for (let step = 0; step < 160; step++) {
        const index = next(6), action = next(7), receiver = next(6);
        const owned = [...holders].filter(([, holder]) => holder === index).map(([token]) => token);
        if (action <= 1 && registered[index] === 0 && owned.length) {
          const token = owned[next(owned.length)];
          await assembly.connect(users[index]).deposit(token);
          registered[index] = token; holders.set(token, -1);
        } else if (action <= 3 && registered[index] !== 0) {
          const token = registered[index];
          await assembly.connect(users[index]).withdrawTo(users[receiver].address);
          registered[index] = 0; holders.set(token, receiver);
        } else if (action === 4 && owned.length) {
          const token = owned[next(owned.length)];
          await nft.connect(users[index]).transferFrom(users[index].address, users[receiver].address, token);
          holders.set(token, receiver);
        } else if (action === 5 && owned.length) {
          const token = owned[next(owned.length)];
          await nft.connect(users[index]).transferFrom(users[index].address, assembly.target, token);
          holders.set(token, -2);
        } else {
          const recoverable = [...holders].find(([, holder]) => holder === -2);
          if (recoverable) {
            await assembly.recoverUnregisteredNFT(nft.target, recoverable[0], users[receiver].address, ethers.id(`audit-${seed}-${step}`));
            holders.set(recoverable[0], receiver);
          } else {
            await expect(assembly.connect(outsider).withdraw()).to.be.revertedWithCustomError(assembly, 'NotRegistered');
          }
        }
        const block = await ethers.provider.getBlockNumber();
        snapshots.push({ block, flags: registered.map(token => token > 0 ? 1 : 0) });
        await mine();
        const total = registered.filter(Boolean).length;
        expect(await assembly.getPastRegisteredCount(block)).to.equal(total);
        for (let i = 0; i < users.length; i++) {
          expect(await assembly.registeredTokenId(users[i].address)).to.equal(registered[i]);
          expect(await assembly.getPastRegistration(users[i].address, block)).to.equal(registered[i] > 0 ? 1 : 0);
        }
        for (const [token, holder] of holders) {
          const depositor = registered.indexOf(token);
          expect(await assembly.depositorOf(token)).to.equal(depositor >= 0 ? users[depositor].address : ethers.ZeroAddress);
          expect(await nft.ownerOf(token)).to.equal(holder < 0 ? assembly.target : users[holder].address);
        }
        expect(await nft.balanceOf(assembly.target)).to.equal([...holders.values()].filter(holder => holder < 0).length);
        const past = snapshots[next(snapshots.length)];
        expect(await assembly.getPastRegisteredCount(past.block)).to.equal(past.flags.reduce((a, b) => a + b, 0));
        for (let i = 0; i < users.length; i++) expect(await assembly.getPastRegistration(users[i].address, past.block)).to.equal(past.flags[i]);
      }
    });
  }
});
