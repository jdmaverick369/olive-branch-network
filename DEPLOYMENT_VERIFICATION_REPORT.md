# Deployment Verification Report - StakingPools Contract

## Executive Summary
**Status**: ⚠️ DISCREPANCY DETECTED - v8.5.0 deployed, not v8.9.0 as expected

The Nov 9, 2025 governance upgrade executed successfully, but deployed **v8.5.0-perpool-charity-clean** instead of the expected **v8.9.0-charity-freeze+shutdown+forceExit+remove**.

---

## Deployment Details

### What Was Queued (Nov 9)
- **File**: `governance-operations/2025-11-09-upgrade_stakingpools.json`
- **Network**: Base
- **Proxy Address**: `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2`
- **Implementation Address (in JSON)**: `0x7d8b5E3744e659e954B8b1D608442d6805187884`
- **Timelock Delay**: 86400 seconds (24 hours)
- **Operation ID**: `0x2a9b97a5c0cb811e02a024e45cd1829caaf2974719ab4493d3f240482f961e1d`

### What Actually Deployed (Queried Live on Base)
```
Proxy address: 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2
Implementation: 0x7d8b5E3744e659e954B8b1D608442d6805187884
Contract version: 8.5.0-perpool-charity-clean
Owner: 0x86396526286769ace21982E798Df5eef2389f51c (TimelockController)
```

---

## Git History Analysis

### v8.5.0-perpool-charity-clean
- **First introduced**: Commit `6b867d7` ("Add obn-project (restored from local snapshot)")
- **Also present in**: Commit `a0c6918` ("Update staking rewards split (88/10/1/1) + upgrade scripts")
- **Status**: Old version, predates all recent governance work

### v8.9.0-charity-freeze+shutdown+forceExit+remove
- **Introduced**: Commit `cbb0dc2` ("Major StakingPools upgrade v8.9.0 + governance refactor")
- **Status**: Current HEAD version
- **Expected deployment**: This should have been deployed if the Nov 9 proposal was for v8.9.0

---

## The Mismatch Explained

The implementation address `0x7d8b5E3744e659e954B8b1D608442d6805187884` is associated with **v8.5.0**, not v8.9.0.

This means:
1. The governance proposal JSON file was created to deploy an old version
2. The JSON file's `newImplementation` address is pointing to a v8.5.0 contract, not v8.9.0
3. When executed, it deployed what was queued: v8.5.0

---

## What Contract Features Are Actually Live

### ✅ Present in v8.5.0:
- Pool management (addPool, removePool)
- Basic staking and reward mechanism
- Charity wallet system
- Bootstrap mechanism

### ❌ Missing - NOT Deployed Yet:
- Bootstrap migration functionality (migrateBootstrap)
- Force exit to self functionality (forceExitUserToSelf)
- Hardening validations for reward preservation
- Hardening validations for lock overflow prevention
- Version 9.0 improvements

---

## Implications

### Current Risk
The deployed contract **does not have** the migrateBootstrap function you've been implementing. This means:
- You cannot migrate a nonprofit bootstrap address via `migrateBootstrap()`
- The function doesn't exist on the live contract
- Any code calling `migrateBootstrap()` will fail with "function does not exist"

### Required Action
You need to create a **new governance proposal** to deploy the hardened v9.0 contract with all the improvements:
1. The new implementation address will be different from `0x7d8b5E3744...`
2. Will need to compile v9.0 to get its deployment bytecode and address
3. Then queue and execute a new upgrade proposal

---

## Next Steps

1. **Compile v9.0** to get its implementation address
2. **Create new governance proposal** for v9.0 deployment
3. **Schedule the upgrade** via timelock (24-hour delay)
4. **Execute after delay** to make it live

---

## Technical Details - Git Commits

```
cbb0dc2 Major StakingPools upgrade v8.9.0 + governance refactor
  └─ Contains: v9.0 (hardened version with migrateBootstrap, etc.)
  
30a1a5b Update contracts: OBNToken, OBNStakingPools
  └─ Contains: v8.6.0-gross-pending-88_10_1_1

a0c6918 Update staking rewards split (88/10/1/1) + upgrade scripts
  └─ Contains: v8.6.0-gross-pending-88_10_1_1

6b867d7 Add obn-project (restored from local snapshot)
  └─ Contains: v8.5.0-perpool-charity-clean (CURRENTLY DEPLOYED)
```

---

## Summary Table

| Property | v8.5.0 (Live) | v8.9.0 (Queued but not used) | v9.0 (Implemented but not deployed) |
|----------|---------------|------------------------------|-------------------------------------|
| Git Commit | 6b867d7 | cbb0dc2 | Current branch |
| Status | ✅ Live on Base | ❌ Code in repo, not deployed | ❌ Not deployed yet |
| Has migrateBootstrap | ❌ No | ❌ No | ✅ Yes |
| Has forceExitUserToSelf | ❌ No | ❌ No | ✅ Yes |
| Has hardening checks | ❌ No | ❌ No | ✅ Yes |
| Implementation Address | 0x7d8b5E3744... | Unknown | Not yet compiled |

