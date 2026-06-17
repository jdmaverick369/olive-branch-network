// Verification constructor args for unverified contracts.
// Run after `npx hardhat compile` to ensure artifacts are fresh.
//
// TeamVesting:
//   npx hardhat verify --network base 0x9428Edd912224778d84D762ebCDA52e1c829aB8d \
//     0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685 \
//     0xf765637e2c162219bc188391c0869c7bD35d8816 \
//     1757119558 \
//     0x64C9c9cEDc94e58EA9C98f92DAF65F19383C5118
//
// OBNTimeLock:
//   npx hardhat verify --network base --constructor-args scripts/governance/verify_contracts.js \
//     0x86396526286769ace21982E798Df5eef2389f51c
//
// If OBNTimeLock verification fails (metadata hash mismatch due to source path),
// re-run with --contract "contracts/OBNTimeLock.sol:OBNTimeLock" flag.

// Only the Timelock uses array args that need a file; TeamVesting uses inline CLI args.
module.exports = [
  86400,                                                       // minDelay (24 hours)
  ["0x066e2FABb036deab7DC58bAde428F819AC3542DD"],             // proposers (OPERATOR_SAFE)
  ["0x0000000000000000000000000000000000000000"],             // executors (open)
  "0x066e2FABb036deab7DC58bAde428F819AC3542DD",              // admin (Safe, renounced post-deploy)
];
