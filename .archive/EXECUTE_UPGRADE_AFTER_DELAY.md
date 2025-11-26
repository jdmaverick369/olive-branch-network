# Execute Upgrade After Timelock Delay

**Status**: ✅ Operation successfully scheduled

---

## Important Details

| Parameter | Value |
|-----------|-------|
| **Operation ID** | `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3` |
| **Scheduled At** | 2025-11-24 19:42:35 UTC |
| **Ready At** | 2025-11-25 19:42:35 UTC (24 hours later) |
| **Delay** | 86400 seconds (24 hours) |
| **Target** | StakingPools Proxy: `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` |
| **New Implementation** | `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466` |

---

## Timeline

```
2025-11-24 19:42:35 UTC (TODAY)
└─ Operation scheduled in Timelock ✅ DONE
   └─ 24-hour delay begins

2025-11-25 19:42:35 UTC (TOMORROW)
└─ Delay expires - operation becomes ready
   └─ Anyone can execute via executeBatch()

AFTER EXECUTION
└─ Proxy implementation updated
└─ StakingPools v9.1 with EIP-1271 goes live
```

---

## How to Execute

### Method 1: Using Script (Recommended)

```bash
cd /c/obn/obn-project
npx hardhat run scripts/governance/execute_eip1271_upgrade.js --network base
```

### Method 2: Using Cast (Manual)

First, verify the operation is ready:

```bash
cast call 0x86396526286769ace21982E798Df5eef2389F51c \
  "isOperationReady(bytes32)" \
  0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3 \
  --rpc-url https://base-rpc.publicnode.com
```

Should return: `true`

Then execute:

```bash
cast send 0x86396526286769ace21982E798Df5eef2389F51c \
  "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)" \
  '[0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2]' \
  '[0]' \
  '[0x4f1ef2860000000000000000000000006efe57e45e82f7a7dcf9e55a110fb3436e5b446600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000]' \
  '0x0000000000000000000000000000000000000000000000000000000000000000' \
  '0x817f5d7b8979e0fc737c91940954164e6992f1a5685d52e75c3718357bf0fb6d' \
  --rpc-url https://base-rpc.publicnode.com \
  --private-key $PRIVATE_KEY
```

### Method 3: Using Safe Transaction Service

If using a multisig executor:

1. Go to Safe transaction service
2. Call `executeBatch()` with parameters:
   - targets: `[0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2]`
   - values: `[0]`
   - datas: `[0x4f1ef286...]`
   - predecessor: `0x0000...0000`
   - salt: `0x817f5d7b8979e0fc737c91940954164e6992f1a5685d52e75c3718357bf0fb6d`

---

## Pre-Execution Verification

### 1. Check Operation is Ready

```bash
cast call 0x86396526286769ace21982E798Df5eef2389F51c \
  "isOperationReady(bytes32)" \
  0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3 \
  --rpc-url https://base-rpc.publicnode.com
```

Expected output: `true`

### 2. Check Operation Exists

```bash
cast call 0x86396526286769ace21982E798Df5eef2389F51c \
  "isOperationPending(bytes32)" \
  0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3 \
  --rpc-url https://base-rpc.publicnode.com
```

Expected output: `false` (after ready time) or `true` (before ready time)

### 3. Check Current Proxy Implementation

```bash
cast call 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
  "implementation() view returns (address)" \
  --rpc-url https://base-rpc.publicnode.com
```

Expected BEFORE upgrade: `0x04a8b485c3eb64a0f8991ade3532d28e5ab9b96b`
Expected AFTER upgrade: `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466`

---

## Parameters Reference

**Timelock**: `0x86396526286769ace21982E798Df5eef2389F51c`

**Operation ID**: `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3`

**Targets**: `[0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2]` (StakingPools proxy)

**Values**: `[0]`

**Datas**: `[0x4f1ef2860000000000000000000000006efe57e45e82f7a7dcf9e55a110fb3436e5b446600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000]`

**Predecessor**: `0x0000000000000000000000000000000000000000000000000000000000000000`

**Salt**: `0x817f5d7b8979e0fc737c91940954164e6992f1a5685d52e75c3718357bf0fb6d`

---

## Post-Execution Verification

After the transaction completes:

### 1. Verify Proxy Points to New Implementation

```bash
cast call 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
  "implementation() view returns (address)" \
  --rpc-url https://base-rpc.publicnode.com
```

Should return: `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466` ✅

### 2. Check Version String

```bash
cast call 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
  "version() view returns (string)" \
  --rpc-url https://base-rpc.publicnode.com
```

Should return: `8.5.0-perpool-charity-clean` (old version still, until updated)

### 3. Verify New Functions Exist

```bash
cast call 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
  "domainSeparator() view returns (bytes32)" \
  --rpc-url https://base-rpc.publicnode.com
```

Should return a bytes32 value (non-zero)

### 4. Test a Deposit (Sanity Check)

```bash
cast send 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2 \
  "deposit(uint256,uint256)" \
  0 \
  1000000000000000000 \
  --rpc-url https://base-rpc.publicnode.com \
  --private-key $YOUR_TEST_KEY
```

Should succeed without revert

---

## Troubleshooting

### Operation Not Ready

**Error**: `isOperationReady` returns false even after 24 hours

**Solution**: Check:
1. Correct timestamp in Timelock
2. 24 hours have actually passed
3. Operation ID is correct

### Transaction Reverts

**Error**: `executeBatch` reverts

**Check**:
1. All parameters match exactly
2. Operation ID is correct: `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3`
3. Salt matches: `0x817f5d7b8979e0fc737c91940954164e6992f1a5685d52e75c3718357bf0fb6d`
4. New implementation exists: `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466`

### Proxy Implementation Unchanged

**After executing but proxy still points to old implementation**:

Check:
1. Transaction mined successfully
2. Call to `upgradeToAndCall` succeeded
3. Proxy uses ERC1967 pattern (should)
4. Check implementation at ERC1967 slot: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`

---

## Important Notes

⚠️ **CRITICAL PARAMETERS** (must match exactly):

- **Operation ID**: Must be `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3`
- **Salt**: Must be `0x817f5d7b8979e0fc737c91940954164e6992f1a5685d52e75c3718357bf0fb6d`
- **Predecessor**: Must be all zeros
- **Min delay**: Must be 86400 seconds

Any change to these will result in a different operation ID and execution will fail.

---

## Success Criteria

✅ Execution successful if:

1. `executeBatch()` transaction confirms
2. No revert errors in transaction
3. New implementation points to `0x6eFe57E45E82F7a7DCF9E55A110Fb3436E5b4466`
4. Existing functions still work (`deposit`, `withdraw`, `claim`)
5. New functions work (`depositWithSignature`, `domainSeparator`)

---

## Timeline

- **2025-11-24 13:39:15 UTC**: Operation scheduled ✅
- **2025-11-25 13:39:15 UTC**: Delay expires, ready to execute
- **2025-11-25 (anytime after 13:39:15 UTC)**: Execute upgrade
- **Post-execution**: StakingPools v9.1 with EIP-1271 live

---

**Operation ID**: `0xB31991D7AE8A777CB3F0D7951D718F15B198F150AAB02DD4D8156BDC408C45F3`

Save this document. You'll need it tomorrow to execute the upgrade.
