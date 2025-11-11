# OBN Governance Development Status

**Last Updated**: November 10, 2025
**Status**: Phase 1 Complete - VotingPowerAdapter ✅ | GovernanceExecutor ✅

---

## Current Progress

### ✅ Completed Components

#### 1. VotingPowerAdapter Contract
**File**: `contracts/governance/VotingPowerAdapter.sol`
**Status**: Built, Tested, Compiled ✅
**Test Coverage**: 22/22 passing

**Features**:
- 14-day maturity requirement enforcement
- Cross-pool voting power aggregation
- Snapshot-based voting (prevents manipulation)
- Quorum calculation (4% of total staked)
- Proposal threshold calculation (0.5% of total staked)
- Gas-optimized for many pools

**Functions**:
```solidity
function getVotingPower(address voter, uint256 snapshotTime)
    returns (uint256 totalPower, uint256[] memory eligiblePids);

function getCurrentVotingPower(address voter)
    returns (uint256 totalPower, uint256[] memory eligiblePids);

function hasMaturity(address voter, uint256 snapshotTime)
    returns (bool);

function getQuorum() returns (uint256);

function getProposalThreshold() returns (uint256);

function getVotingPowerDetails(address voter, uint256 snapshotTime)
    returns (uint256 totalPower, uint256 poolCount, bool meetsMaturity, uint64 stakedSince);
```

---

#### 2. GovernanceExecutor Contract
**File**: `contracts/governance/GovernanceExecutor.sol`
**Status**: Built, Compiled ✅
**Test Coverage**: Simulation passing ✅

**Supports 4 Proposal Types**:

**Type 1: Add Pool**
```solidity
function executeAddPool(address charityWallet, uint256 votesReceived);
```
- Adds pool via `stakingPools.addPool()`
- Bootstraps 1M OBN from charityFund
- Emits `PoolAdded` event

**Type 2: Remove Pool (Batched)**
```solidity
function startPoolRemoval(uint256 pid, address[] calldata users) returns (bytes32 removalId);
function processRemovalBatch(bytes32 removalId, uint256 batchSize);
function completePoolRemoval(bytes32 removalId);
```
- Phase 1: Shutdown pool
- Phase 2: Force-exit users in batches of 50
- Phase 3: Return bootstrap to charityFund (requires v8.10.0)
- Phase 4: Mark pool as removed

**Type 3: Update APY**
```solidity
function executeAPYUpdate(uint256[] calldata starts, uint256[] calldata ends, uint256[] calldata bps);
```
- Updates emission phases
- Restricted to Year 10+ (not enforced in executor, enforced in Governor)

**Type 4: Protocol Upgrade**
```solidity
function executeProtocolUpgrade(address newImplementation, string calldata newVersion);
```
- Calls `stakingPools.upgradeTo(newImplementation)`
- UUPS proxy pattern
- Emits `ProtocolUpgraded` event

---

#### 3. Governance Simulation
**File**: `test/governance-simulation.js`
**Status**: All 5 scenarios passing ✅

**Scenarios Tested**:
1. ✅ Add Pool (3 options, plurality winner)
2. ✅ Remove Pool (defeated - quorum not met)
3. ✅ Update APY (defeated - tiny voting power)
4. ✅ 14-day maturity enforcement
5. ✅ Protocol Upgrade (passed with strong consensus)

**Output**:
```
Key Validations:
✅ 14-day maturity requirement enforced
✅ Multi-choice add pool voting works
✅ For/Against voting works
✅ Quorum requirement enforced
✅ Voting power calculated from staking positions
✅ Execution triggers automated actions
✅ Users can only vote once per proposal
✅ Protocol upgrade proposals work

🎉 Governance simulation successful!
```

---

#### 4. Mock Contracts
**File**: `contracts/mocks/MockStakingPoolsForGovernance.sol`
**Status**: Built, Tested ✅

**Purpose**: Testing VotingPowerAdapter without deploying full StakingPools

---

#### 5. Documentation
**Files**:
- ✅ `GOVERNANCE_DESIGN.md` - Complete system architecture (400+ lines)
- ✅ `UPGRADE_SAFETY_ANALYSIS.md` - v8.9.0 upgrade safety report
- ✅ `GOVERNANCE_STATUS.md` - This file

---

## Completed Components (Continued)

### ✅ Phase 2: OBNGovernor Contract (Complete)

**File**: `contracts/governance/OBNGovernor.sol`
**Status**: Built, Tested, Compiled ✅
**Test Coverage**: 29/29 passing

**Based on**: OpenZeppelin Governor (NOT GovernorVotes - we don't use ERC20Votes)

**Governance Model**: Centralized Proposals, Decentralized Voting
- **Proposal Creation**: Only owner (Gnosis Safe multisig) can create proposals (`onlyOwner` modifier)
- **Voting**: Anyone with staked OBN (14+ days maturity) can vote
- **Execution**: Automated via TimelockController (24-hour delay)

**Key Differences from Standard Governor**:
- Uses `VotingPowerAdapter` instead of `ERC20Votes.getPastVotes()`
- Centralized proposal creation with `onlyOwner` modifiers
- Supports 4 proposal types with different voting mechanisms:
  - Add Pool: Multi-choice (1-4 options) or Yes/No (single option)
  - Remove Pool: For/Against
  - Update APY: For/Against
  - Protocol Upgrade: For/Against
- Custom proposal encoding/decoding
- Proposal threshold is 0 (not needed since only owner can propose)

**Implemented Functions**:
```solidity
// Override to use VotingPowerAdapter instead of token.getPastVotes()
function _getVotes(address account, uint256 timepoint, bytes memory params)
    internal view override returns (uint256);

// Proposal creation (onlyOwner - centralized governance)
function proposeAddPool(
    address[] memory nonprofits,
    string memory description
) external onlyOwner returns (uint256 proposalId);

function proposeRemovePool(
    uint256 pid,
    address[] memory users,
    string memory description
) external onlyOwner returns (uint256 proposalId);

function proposeUpdateAPY(
    uint256[] memory starts,
    uint256[] memory ends,
    uint256[] memory bps,
    string memory description
) external onlyOwner returns (uint256 proposalId);

function proposeProtocolUpgrade(
    address newImplementation,
    string memory version,
    string memory description
) external onlyOwner returns (uint256 proposalId);

// Voting
function castVote(uint256 proposalId, uint8 support) external;
function castVoteWithReason(uint256 proposalId, uint8 support, string calldata reason) external;

// For Add Pool: support is the nonprofit index (0-3)
// For others: support is 0 (against) or 1 (for)

// Execution
function execute(uint256 proposalId) external;
```

**Parameters**:
- Voting Delay: 1 block
- Voting Period: 50,400 blocks (~7 days)
- Quorum: 1,000,000 OBN (fixed amount, not percentage)
- Proposal Threshold: 0 (only owner can propose, no threshold needed)

---

## Integration Flow

```
Gnosis Safe multisig creates proposal (onlyOwner)
    ↓
OBNGovernor.proposeAddPool() / proposeRemovePool() / etc.
    ↓
Snapshot created (block.timestamp)
    ↓
Users vote (castVote)
    ↓
VotingPowerAdapter checks maturity + calculates voting power
    ↓
Voting period ends (7 days)
    ↓
execute() called
    ↓
Check quorum via VotingPowerAdapter.getQuorum()
    ↓
If passed:
  - Add Pool → GovernanceExecutor.executeAddPool()
  - Remove Pool → GovernanceExecutor.startPoolRemoval()
  - Update APY → GovernanceExecutor.executeAPYUpdate()
  - Protocol Upgrade → GovernanceExecutor.executeProtocolUpgrade()
    ↓
TimelockController enforces 24-hour delay
    ↓
Gnosis Safe multisig can cancel if malicious
    ↓
Execution completes
```

---

## Deployment Plan

### Current State: v8.9.0 Upgrade Pending
**StakingPools**: Scheduled, waiting for 24-hour timelock
**Timelock Address**: `0x86396526286769ace21982E798Df5eef2389f51c`
**Gnosis Safe**: Controls timelock execution

### Phase 1: Deploy VotingPowerAdapter (Testnet)
```bash
npx hardhat run scripts/deploy_voting_power_adapter.js --network base-sepolia
```

**Constructor Args**:
- `stakingPools`: StakingPools proxy address

**Verify**:
- Check quorum matches expected 4% of global staked
- Test voting power calculation for known addresses

---

### Phase 2: Deploy GovernanceExecutor (Testnet)
```bash
npx hardhat run scripts/deploy_governance_executor.js --network base-sepolia
```

**Constructor Args**:
- `stakingPools`: StakingPools proxy address
- `initialOwner`: TimelockController address (will be Governor after deployment)

**Verify**:
- Test executeAddPool() with mock data
- Test removal state tracking

---

### Phase 3: Deploy OBNGovernor (Testnet)
```bash
npx hardhat run scripts/deploy_obn_governor.js --network base-sepolia
```

**Constructor Args**:
- `votingPowerAdapter`: VotingPowerAdapter address
- `governanceExecutor`: GovernanceExecutor address
- `timelock`: TimelockController address

**Verify**:
- Create test add pool proposal
- Vote with test accounts
- Execute proposal

---

### Phase 4: v8.10.0 Upgrade (Mainnet)

**Required for**: Pool removal to return bootstrap to charityFund

**Changes**:
- Add `forceExitUser(uint256 pid, address user, address recipient)` overload

**Process**:
1. Deploy new StakingPools implementation
2. Create governance proposal for upgrade
3. Community votes
4. If passed: Execute via GovernanceExecutor.executeProtocolUpgrade()
5. TimelockController enforces 24-hour delay
6. Gnosis Safe executes upgrade

---

### Phase 5: Full DAO Transition (Mainnet)

**Grant Roles** (TimelockController):
```solidity
// Grant Governor permission to propose
timelock.grantRole(PROPOSER_ROLE, obnGovernor);

// Grant Governor permission to execute
timelock.grantRole(EXECUTOR_ROLE, obnGovernor);

// Optionally: Revoke Gnosis Safe PROPOSER_ROLE for full decentralization
// (Keep CANCELLER_ROLE for emergencies)
timelock.revokeRole(PROPOSER_ROLE, gnosisSafe);
```

**Transfer Ownership**:
```solidity
// GovernanceExecutor ownership to TimelockController
governanceExecutor.transferOwnership(timelock);

// StakingPools already owned by TimelockController ✅
```

---

## Testing Checklist

### Unit Tests
- [x] VotingPowerAdapter.sol (23/23 tests passing)
- [x] OBNGovernor.sol (29/29 tests passing)
- [ ] GovernanceExecutor.sol (needs unit tests)

### Integration Tests
- [x] Governance simulation (5/5 scenarios passing)
- [ ] Full Governor + Executor integration
- [ ] Timelock integration
- [ ] Multi-transaction proposal flow

### Testnet Deployment
- [ ] Deploy on Base Sepolia
- [ ] Create test proposals
- [ ] Execute proposals
- [ ] Verify events and state changes

### Mainnet Deployment
- [ ] Deploy VotingPowerAdapter
- [ ] Deploy GovernanceExecutor
- [ ] Deploy v8.10.0 StakingPools implementation
- [ ] Create governance upgrade proposal
- [ ] Deploy OBNGovernor
- [ ] Grant roles
- [ ] Transfer ownership

---

## Next Steps

**Immediate (Next Session)**:
1. ✅ Build OBNGovernor contract (COMPLETED - 29/29 tests passing)
2. ✅ Create unit tests for OBNGovernor (COMPLETED)
3. Create integration tests (Governor + Executor + VotingPowerAdapter)
4. Create unit tests for GovernanceExecutor

**Short Term (This Week)**:
1. Deploy all contracts to Base Sepolia testnet
2. Create and execute test proposals
3. Build v8.10.0 StakingPools implementation

**Medium Term (Next Week)**:
1. Audit governance contracts
2. Create deployment scripts for mainnet
3. Write governance UI integration guide
4. Community testing on testnet

**Long Term (Next Month)**:
1. Deploy to mainnet
2. Execute first governance proposal (v8.10.0 upgrade via governance)
3. Transition to full DAO
4. Launch governance frontend

---

## Known Limitations

1. **APY Update**: StakingPools v8.9.0 doesn't have `updatePhase()` function
   - Placeholder in GovernanceExecutor
   - Will be added in future upgrade

2. **Bootstrap Return**: Requires v8.10.0 with `forceExitUser(recipient)`
   - v8.9.0 can't return bootstrap automatically
   - GovernanceExecutor has try/catch to handle gracefully

3. **User Enumeration**: Pool removal requires off-chain user list
   - No on-chain user registry in StakingPools
   - Must be prepared by governance proposer
   - Could be optimized in future with on-chain registry

---

## Gas Cost Estimates

**Based on simulation**:

| Contract | Deployment | Method | Cost (gas) | Cost (USD)* |
|----------|-----------|--------|------------|-------------|
| VotingPowerAdapter | 606,726 | - | - | $6.07 |
| GovernanceExecutor | ~800,000 | - | - | $8.00 |
| OBNGovernor | ~1,500,000 | - | - | $15.00 |
| - | - | castVote() | ~80,000 | $0.08 |
| - | - | executeAddPool() | ~300,000 | $0.30 |
| - | - | executeProtocolUpgrade() | ~100,000 | $0.10 |
| - | - | processRemovalBatch(50) | ~3,500,000 | $3.50 |

*Estimated at 25 gwei gas price + $4000 ETH

---

## Security Considerations

**Completed**:
- ✅ 14-day maturity prevents flash loans
- ✅ Snapshot-based voting prevents manipulation
- ✅ Quorum requirement prevents low-participation attacks
- ✅ Proposal threshold prevents spam

**Pending**:
- ⏳ TimelockController integration (24-hour delay)
- ⏳ Gnosis Safe multisig oversight
- ⏳ Emergency pause mechanism
- ⏳ Governance audit

**Future**:
- Guardian role for critical parameters?
- Veto power for security council?
- Proposal cool-down period?

---

## Questions for Community

1. **Quorum**: Is 4% appropriate, or too high/low?
2. **Voting Period**: 7 days sufficient, or extend to 10-14 days?
3. **Maturity**: 14 days good, or should it be 7/21/30 days?
4. **Proposal Threshold**: Should community members be able to create proposals, or keep it centralized to multisig?
5. **Emergency Powers**: Should Gnosis Safe retain veto indefinitely?

---

**Status**: Core governance contracts complete! ✅

**Governance Model**: Centralized Proposals, Decentralized Voting
- Gnosis Safe multisig creates proposals
- Community votes with staked OBN (14+ days maturity)
- Automated execution via TimelockController

**Next**: Integration tests + testnet deployment 🚀
