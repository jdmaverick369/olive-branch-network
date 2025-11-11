# Gnosis Safe Transaction - v9.0 Upgrade Queue

## Step-by-Step Instructions

### 1. Go to Gnosis Safe
- URL: https://app.safe.global
- Select your safe (OBN DAO Safe)
- Connect your signing wallet

### 2. Click "New Transaction"

### 3. Fill in the Form

#### **Address Field**
```
0x86396526286769ace21982E798Df5eef2389f51c
```
(This is the TimelockController)

#### **ABI Field**
Paste the TimelockController ABI (or just the scheduleBatch function):

```json
[
  {
    "name": "scheduleBatch",
    "type": "function",
    "inputs": [
      {
        "name": "targets",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "values",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "payloads",
        "type": "bytes[]",
        "internalType": "bytes[]"
      },
      {
        "name": "predecessor",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "delay",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
]
```

#### **Transaction Information Section**
Once you paste the ABI, it should auto-detect `scheduleBatch` function. Fill in:

**targets**: 
```
["0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2"]
```

**values**: 
```
["0"]
```

**payloads**: 
```
["0x6fbc15e9000000000000000000000000d2a067721291eb46b735bcb020b5230774e3ee8c00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000"]
```

**predecessor**: 
```
0x0000000000000000000000000000000000000000000000000000000000000000
```

**salt**: 
```
0xa9d8dd4c8aaa92ec821ce8f3713d7dce0ee9503f872d3705d09f04a483c2ff6
```

**delay**: 
```
86400
```

#### **ETH Value**
```
0
```

#### **Hex Encoded Field (if using raw data)**
If the form doesn't have individual parameter fields, paste this entire hex string:

```
0x8f2a0bb000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000000a9d8dd4c8aaa92ec821ce8f3713d7dce0ee9503f872d3705d09f04a483c2ff60000000000000000000000000000000000000000000000000000000000001518000000000000000000000000000000000000000000000000000000000000000010000000000000000000000002c4bd5b2a48a76f288d7f2db23afd3a03b9e7cd2000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000646fbc15e9000000000000000000000000d2a067721291eb46b735bcb020b5230774e3ee8c0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
```

### 4. Review

The transaction should show:
- **To**: Timelock Controller (0x8639...)
- **Function**: scheduleBatch
- **Parameters**: targets, values, payloads, predecessor, salt, delay
- **Value**: 0 ETH

### 5. Sign & Send

1. Click "Review" or "Confirm"
2. Review the details one more time
3. Sign with your wallet(s) - may need multiple signers depending on Safe threshold
4. Once enough signatures, transaction will execute and be queued in the timelock

---

## What This Does

This transaction tells the TimelockController:
- "Schedule an upgrade to implementation 0xD2A067721291EB46B735bcB020b5230774E3EE8C"
- "Wait 86400 seconds (24 hours) before allowing execution"
- "When 24 hours pass, anyone can execute to complete the upgrade"

---

## After Queuing

**Wait exactly 24 hours**, then run:

```bash
cd obn-project
npx hardhat run scripts/governance/execute_upgrade.js --network base
```

This will execute the queued operation and complete the upgrade to v9.0.

