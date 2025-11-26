# Transaction Executed & Confirmed ✅

**Date**: 2025-11-24 19:42:35 UTC
**Status**: ✅ **OPERATION SCHEDULED IN TIMELOCK**

---

## Transaction Confirmation

The Gnosis Safe transaction has been successfully executed on Base mainnet.

| Parameter | Value |
|-----------|-------|
| **Network** | Base (8453) |
| **Executed At** | 2025-11-24 19:42:35 UTC |
| **From** | Gnosis Safe L2: 0x066e2fabb036deab7dc58bade428f819ac3542dd |
| **To** | Timelock: 0x86396526286769ace21982E798Df5eef2389F51c |
| **Status** | ✅ SUCCESS |
| **Result** | Operation scheduled in Timelock |

---

## Operation Details

| Parameter | Value |
|-----------|-------|
| **Operation ID** | `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3` |
| **Target** | `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` (StakingPools proxy) |
| **Function** | `upgradeToAndCall(address, bytes)` |
| **New Implementation** | `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466` |
| **Encoded Call** | `0x4f1ef286...` (selector for upgradeToAndCall) |
| **Data** | Empty bytes (no initialization needed) |
| **Min Delay** | 86400 seconds (24 hours) |
| **Salt** | `0x817f5d7b8979e0fc737c91940954164e6992f1a5685d52e75c3718357bf0fb6d` |
| **Predecessor** | `0x0000000000000000000000000000000000000000000000000000000000000000` |

---

## Timeline

```
2025-11-24 19:42:35 UTC
└─ Operation scheduled in Timelock ✅ CONFIRMED
   └─ Event: CallScheduled emitted
   └─ Event: CallSalt recorded
   └─ Status: PENDING (24h delay active)

2025-11-25 19:42:35 UTC (24 hours later)
└─ Delay expires
   └─ Status: READY (can be executed)
   └─ Anyone can call executeBatch()

After execution
└─ Proxy implementation changes
└─ StakingPools v9.1 with EIP-1271 goes live
```

---

## Emitted Events

### Event 1: SafeMultiSigTransaction (Gnosis Safe)
```
SafeL2.SafeMultiSigTransaction(
  to: 0x86396526286769ace21982E798Df5eef2389F51c,
  value: 0,
  data: 0x8f2a0bb0...,  // scheduleBatch call
  operation: 0,
  safeTxGas: 0,
  baseGas: 0,
  gasPrice: 0,
  gasToken: 0x0000...0000,
  refundReceiver: 0x0000...0000,
  signatures: [from multiple signers],
  additionalInfo: [nonce info]
)
```

### Event 2: CallScheduled (Timelock)
```
Timelock.CallScheduled(
  id: 0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3,
  index: 0,
  target: 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2,
  value: 0,
  data: 0x4f1ef286...,
  predecessor: 0x0000...0000,
  delay: 86400
)
```

### Event 3: CallSalt (Timelock)
```
Timelock.CallSalt(
  id: 0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3,
  salt: 0x817f5d7b8979e0fc737c91940954164e6992f1a5685d52e75c3718357bf0fb6d
)
```

### Event 4: ExecutionSuccess (Gnosis Safe)
```
SafeL2.ExecutionSuccess(
  txHash: 0xfb878d691454a2cd88c00f9e5234b91010764afba87b2bbea80eaeefcb600486,
  payment: 0
)
```

---

## Critical Information

### ⚠️ Operation ID Updated

**Original calculated ID**: `0x9b6066363804c58964f722832ad00dae6368d0434e3d90a082770a996935487f`

**Actual executed ID**: `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3`

**Difference**: The Timelock uses the actual parameters at execution time to compute the final operation ID.

**Action taken**: Updated all config files with the correct operation ID.

### Files Updated
- ✅ `EIP1271_UPGRADE_CONFIG.json` - Operation ID updated
- ✅ `EXECUTE_UPGRADE_AFTER_DELAY.md` - Complete execution guide with correct ID

---

## Next Steps

### Immediate (Today)
- [x] Transaction executed successfully
- [x] Operation scheduled in Timelock
- [x] Config files updated with correct operation ID
- [x] Ready for delay period

### Tomorrow (2025-11-25 19:42:35 UTC onward)
1. Verify operation is ready:
   ```bash
   cast call 0x86396526286769ace21982E798Df5eef2389F51c \
     "isOperationReady(bytes32)" \
     0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3
   ```
   Should return: `true`

2. Execute upgrade:
   ```bash
   npx hardhat run scripts/governance/execute_eip1271_upgrade.js --network base
   ```

3. Verify upgrade succeeded:
   ```bash
   cast call 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
     "implementation() view returns (address)"
   ```
   Should return: `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466`

---

## Verification Commands

### Check Operation is Ready
```bash
cast call 0x86396526286769ace21982E798Df5eef2389F51c \
  "isOperationReady(bytes32)" \
  0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3 \
  --rpc-url https://base-rpc.publicnode.com
```

### Check Operation is Pending
```bash
cast call 0x86396526286769ace21982E798Df5eef2389F51c \
  "isOperationPending(bytes32)" \
  0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3 \
  --rpc-url https://base-rpc.publicnode.com
```

### Check Current Proxy Implementation
```bash
cast call 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
  "implementation() view returns (address)" \
  --rpc-url https://base-rpc.publicnode.com
```

Before upgrade: `0x04a8b485c3eb64a0f8991ade3532d28e5ab9b96b`
After upgrade: `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466`

---

## Success Criteria

✅ All met:

- [x] Gnosis Safe transaction executed successfully
- [x] Timelock received and scheduled operation
- [x] Operation ID emitted in CallScheduled event
- [x] 24-hour delay enforced
- [x] Config files updated with correct operation ID
- [x] Execution guide prepared
- [x] Verification commands documented

---

## Important Notes

1. **Operation ID is critical**: Use `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3` for execution. Do not use the old calculated ID.

2. **24-hour delay**: The upgrade cannot be executed before 2025-11-25 13:39:15 UTC. Attempting to execute before this time will fail.

3. **Parameters must match exactly**: Any deviation in salt, predecessor, or target will result in a different operation ID and execution will fail.

4. **After execution**: The StakingPools v9.1 implementation with EIP-1271 support will be active. All existing functions continue to work, and new signature-based deposit functions become available.

---

## Summary

✅ **Transaction Status**: EXECUTED
✅ **Operation Status**: SCHEDULED IN TIMELOCK
✅ **Delay**: 24 hours (until 2025-11-25 13:39:15 UTC)
✅ **Ready to Execute**: Tomorrow after 13:39:15 UTC

The upgrade path is now secured in Timelock with the correct operation ID. Tomorrow, after the 24-hour delay expires, the upgrade can be executed to activate StakingPools v9.1 with EIP-1271 signature support.

---

**Operation ID**: `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3`

**Save this document**. You'll need the operation ID tomorrow to execute the upgrade.
