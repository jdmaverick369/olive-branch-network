// scripts/governance/nonprofits.js
// Registry of OBN nonprofit pools. Single source of truth for PID → nonprofit mapping.
// Scripts use this to resolve wallet addresses by PID so you never have to copy-paste
// a raw address on the command line.
//
// To add a future pool: append an entry here BEFORE running gen_safe_addPool.js.
// wallet must match exactly what will be passed to addPool(charityWallet) on-chain.
"use strict";

const NONPROFITS = [
  { pid: 0,  name: "Give Directly",                       wallet: "0x750EF1D7a0b4Ab1c97B7A623D7917CcEb5ea779C" },
  { pid: 1,  name: "Heifer International",                wallet: "0xE04063602B8b6B5d3526e6af873d2A4777E12d92" },
  { pid: 2,  name: "Last Door",                           wallet: "0xAB739D4F2B44F3f4ed8236070A8f97119eaEd4aB" },
  { pid: 3,  name: "Freedom of Press",                    wallet: "0x998F25Be40241CA5D8F5fCaF3591B5ED06EF3Be7" },
  { pid: 4,  name: "Khan Academy",                        wallet: "0x891432Ab6414EFff5d986E14848eCD1e6b2961ae" },
  { pid: 5,  name: "Rainforest Foundation US",            wallet: "0x0A60e17d5c98D491809CD8A15370C53806EEc1ec" },
  { pid: 6,  name: "Tor Project",                        wallet: "0x532Fb5D00f40ced99B16d1E295C77Cda2Eb1BB4F" },
  { pid: 7,  name: "St. Jude Children's Research Hospital", wallet: "0x92EE2370b56DC32794A6CD72585dC01d4288D314" },
  { pid: 8,  name: "charity: water",                     wallet: "0x718A03C0b38889D57224B5A4eC853953f7B1Aa18" },
  { pid: 9,  name: "Internet Archive",                   wallet: "0xa23fa5a73C6366f6a829aC1F452A24eFdc5EcFF7" },
  { pid: 10, name: "K9 Rescue International",            wallet: "0x859D4d3096928048dE53cF256A640aBd428f9bC9" },
];

/**
 * Look up a nonprofit by PID. Throws if not found.
 */
function getByPid(pid) {
  const entry = NONPROFITS.find(n => n.pid === Number(pid));
  if (!entry) throw new Error(`❌ No nonprofit registered for PID ${pid}. Add it to nonprofits.js first.`);
  return entry;
}

/**
 * Look up a nonprofit by wallet address (case-insensitive). Throws if not found.
 */
function getByWallet(wallet) {
  const entry = NONPROFITS.find(n => n.wallet.toLowerCase() === wallet.toLowerCase());
  if (!entry) throw new Error(`❌ No nonprofit registered for wallet ${wallet}.`);
  return entry;
}

module.exports = { NONPROFITS, getByPid, getByWallet };
