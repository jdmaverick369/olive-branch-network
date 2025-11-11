# StakingPools v9.0 Deployment Guide

## Status: Ready to Queue

**Deployment Date**: November 11, 2025  
**Current Live Version**: 8.5.0-perpool-charity-clean  
**Target Version**: 9.0  
**Network**: Base Mainnet  

---

## What's Being Deployed

### New Implementation Address
```
0xD2A067721291EB46B735bcB020b5230774E3EE8C
```

### Key Features in v9.0
✅ **migrateBootstrap()** - Atomic migration of nonprofit bootstrap positions with reward preservation  
✅ **forceExitUserToSelf()** - Emergency exit function for users without honeypot risk  
✅ **Hardening Validations**:
  - Pending reward preservation check (±1 wei tolerance)
  - Lock overflow prevention
  - Atomic charity wallet updates during migration  
✅ **Test Coverage** - All 14 tests passing  

### What Changes from v8.5.0
- Reward splitting mechanism (NET vs GROSS accumulators)
- New bootstrap migration capability
- Enhanced validation and safety checks
- Emergency exit options for locked tokens

---

## Deployment Timeline

### STEP 1: Queue Proposal (Now)
**Time Required**: ~5 minutes (requires Gnosis Safe signatures)

**Instructions**:
1. Go to: https://app.safe.global
2. Connect with wallet that has Gnosis Safe signing permissions
3. Click "New Transaction" → "Contract Interaction"
4. Fill in:
   - **Address**: `0x86396526286769ace21982E798Df5eef2389f51c` (Timelock)
   - **Function**: `scheduleBatch` (look in ABI or use raw data)
   - **Raw Data** (copy the full hex string below):

```
0x8f2a0bb000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000000a9d8dd4c8aaa92ec821ce8f3713d7dce0ee9503f872d3705d09f04a483c2ff60000000000000000000000000000000000000000000000000000000000001518000000000000000000000000000000000000000000000000000000000000000010000000000000000000000002c4bd5b2a48a76f288d7f2db23afd3a03b9e7cd2000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000646fbc15e9000000000000000000000000d2a067721291eb46b735bcb020b5230774e3ee8c0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
```

5. Review transaction details in Gnosis Safe
6. Sign with required signers (usually multisig)
7. Execute transaction to queue

---

### STEP 2: Wait 24 Hours
**Time Required**: 86400 seconds (24 hours, 0 minutes)

The timelock requires this delay for governance security. No action needed during this time.

**When it will be ready**: 
- Queue time (from Step 1) + 24 hours

---

### STEP 3: Execute Upgrade (After 24 Hours)
**Time Required**: ~2 minutes

After the 24-hour delay has passed:

```bash
cd obn-project
npx hardhat run scripts/governance/execute_upgrade.js --network base
```

This will:
- Check that the operation is ready
- Execute the timelock operation
- Upgrade the proxy to v9.0
- Verify the implementation address
- Display the new contract version

---

## Files Created

### Governance Proposal
- **File**: `governance-operations/2025-11-11-upgrade_stakingpools_v9.json`
- **Contains**: 
  - Old implementation: `0x7d8b5E3744e659e954B8b1D608442d6805187884` (v8.5.0)
  - New implementation: `0xD2A067721291EB46B735bcB020b5230774E3EE8C` (v9.0)
  - Timelock target and encoded upgrade function call
  - 24-hour delay parameter

### Gnosis Safe Transaction
- **File**: `governance-operations/2025-11-11-v9-gnosis-tx.json`
- **Contains**: Pre-encoded transaction data for Gnosis Safe

### Deployment Script
- **File**: `scripts/deploy_v9_implementation.js`
- **Purpose**: Deployed the v9.0 implementation bytecode and generated governance JSON

---

## Verification Checklist

Before executing Step 3, verify:

- [ ] Queue transaction was signed and sent via Gnosis Safe
- [ ] 24 hours have passed
- [ ] You have the private key for the signing account in `.env`
- [ ] Network is set to `base` (not base-sepolia)
- [ ] Execute script is at `scripts/governance/execute_upgrade.js`

After execution, verify:

- [ ] Transaction confirmed on Base mainnet
- [ ] New implementation is `0xD2A067721291EB46B735bcB020b5230774E3EE8C`
- [ ] Contract version shows "9.0"
- [ ] All functions exist (check in etherscan or locally)

---

## Rollback Plan

If something goes wrong after deployment:

1. **Before 24 hours**: Cancel the queued operation (requires Gnosis Safe)
2. **After execution**: Queue a new proposal to revert to v8.5.0 implementation
   - Use old implementation address: `0x7d8b5E3744e659e954B8b1D608442d6805187884`
   - Wait another 24 hours
   - Execute

---

## Support

### If Queue Transaction Fails
- Check Gnosis Safe has proper permissions
- Verify signer has the required role (usually PROPOSER_ROLE)
- Ensure sufficient gas for transaction

### If Execution Fails
- Verify 24 hours have passed
- Check that the proxy address is correct
- Ensure signer has EXECUTOR_ROLE on timelock

### Questions About v9.0 Features
See [HARDENING_v8.10.0.md](./obn-project/HARDENING_v8.10.0.md) for detailed documentation on:
- Bootstrap migration behavior
- Reward preservation mechanism
- Lock handling during migration
- Emergency exit function

---

## Timeline Summary

```
Now (T+0):
  └─ Queue proposal via Gnosis Safe
  
T+24 hours:
  └─ Execute upgrade script
  └─ v9.0 goes live on Base
```

**Total time to deployment**: 24 hours + 2 minutes (queue + wait + execute)

