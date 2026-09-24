# V9.3.1 final review and upgrade checklist

Reviewed 2026-09-24. Mainnet deployment/upgrade has NOT been executed.
Scope: MonthlyAutoClaimUpgradeable, V9.3.1's delta from V9.3, upgrade preparation,
and the deployed GitHub worker. This is an engineering review and testing record,
not an independent audit or a guarantee that no vulnerabilities exist.

## Evidence

- Isolated V9.3.1 release suite: 141 passing; one fork test intentionally skipped.
  The broader development suite previously had 176 passing, including future
  V9.4 work excluded from this release. The fork test passed
  separately on a fresh Base fork at block 51736334.
- Live preflight: V9.3 implementation bytecode matches the reviewed baseline;
  Timelock ownership and OpenZeppelin V9.3 -> V9.3.1 storage validation pass.
- Namespaced storage constant independently recomputed and matches the module.
- V9.3.1 runtime: 23660 bytes, below the 24576-byte EIP-170 maximum.
- Existing deposit, withdrawal, claim, reward splitting and checkpoint logic are
  unchanged from V9.3. Executor has no withdrawal, recipient-change or admin power.
- Contract tests cover wallet consent/nonces, revoked consent, monthly limits,
  unauthorized callers, atomic batch rollback, implementation initializer lock,
  and Timelock schedule/delay/execute with atomic V9.3.1 initialization.
- Base Sepolia receipt evidence proves sponsorship for 1, 2 and 32 pools.
  The 32-pool operation used 5557453 gas. See autoclaim-sepolia-results.json and
  autoclaim-sepolia-max-results.json. Negative repeat/revocation checks were calls,
  not deliberately failed sponsored transactions.
- GitHub worker f63a55ae52e90c14da95e82748752ec0383960eb: 13 tests and read-only
  mainnet readiness check passed; claim job skipped with automation disabled.
  https://github.com/jdmaverick369/obn-frontend/actions/runs/36015506072
- Governance readback: Safe threshold 2 of 3; Safe has proposer role; minimum
  Timelock delay 86400 seconds; execution is open after readiness.

No new critical/high-severity issue was identified in the reviewed V9.3.1 change.
Known limits: UTC calendar months, not a rolling 30-day cooldown; manual claims
and legacy owner-only claimFor remain independent of autoclaim consent/limits.
CDP or RPC outages and ambiguous submissions may halt automation for recovery.
Cache/artifact persistence requires operator recovery if the latest journal is
lost. Paymaster limits aggregate on the executor address. Testnet sponsorship
does not verify the production allowlist or guarantee future gas acceptance.

## Addresses

- Staking proxy (unchanged): 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2
- Current V9.3 implementation: 0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E
- Timelock: 0x86396526286769ace21982E798Df5eef2389f51c
- Operator Safe: 0x066e2FABb036deab7DC58bAde428F819AC3542DD
- Executor SMART ACCOUNT: 0x8cc01b1EA8a1Bb480456AEF2B91B7cBA81A21d27

Deploy only OBNStakingPoolsV931. MonthlyAutoClaimUpgradeable is compiled into it;
it is not separately deployed. No token, lens, AnnualGovernance or V9.4 upgrade
is part of this release.

## 1. Freeze the release and leave automation disabled

The release contains the reviewed contract sources, required build configuration,
tests and upgrade tooling. Its compiled implementation bytecode exactly matches
the reviewed development build. Preserve the exact compiler/lockfile and
build info used for deployment and verification. Do not deploy unfinished V9.4.
Keep the GitHub repository variable AUTOCLAIM_ENABLED=false.

The following commands run in PowerShell from C:\obn\obn-project. The project's
.env must contain the mainnet RPC, funded deployment signer and explorer API key.
The deployment signer pays for implementation deployment only; it does not gain
ownership of the existing staking proxy.

```powershell
Set-Location C:\obn\obn-project
$env:FORK_MAINNET = 'false'
$env:AUTOCLAIM_EXECUTOR = '0x8cc01b1EA8a1Bb480456AEF2B91B7cBA81A21d27'
$env:ACTION = 'check'
npx.cmd hardhat run scripts/governance/prepare_v931_upgrade.js --network base
```

Stop on any failed check or baseline mismatch.

## 2. Deploy and verify the implementation

This action spends real Base ETH but does not upgrade the proxy:

```powershell
$env:ACTION = 'deploy'
npx.cmd hardhat run scripts/governance/prepare_v931_upgrade.js --network base
$env:STAKING_V931_IMPL = '<implementation address printed by deployment>'
npx.cmd hardhat verify --network base --contract contracts/StakingPoolsV931.sol:OBNStakingPoolsV931 $env:STAKING_V931_IMPL
```

Record the deployment receipt and verified source. Resolve any explorer/API
verification error before scheduling; never change contract/compiler settings
merely to get verification through. Do not rerun deploy blindly after a timeout;
inspect the printed deployment transaction first to avoid duplicate deployments.

## 3. Generate and execute the schedule in Safe

```powershell
$env:ACTION = 'schedule'
npx.cmd hardhat run scripts/governance/prepare_v931_upgrade.js --network base
```

The script validates deployed candidate bytecode and writes an unsigned JSON to
C:\obn\governance-operations\<date>-staking-v931-autoclaim-schedule.json.
Import it into the Operator Safe's Transaction Builder on Base. Confirm:

- Outer target is the Timelock, calling scheduleBatch.
- The scheduled target is the existing staking proxy, with value 0.
- Its call is upgradeToAndCall(candidate, initializeV931(executor)).
- Candidate is exactly the deployed/verified V9.3.1 implementation.
- Executor is the smart account above, not its EOA owner.
- Delay is at least 86400 seconds.

Obtain 2-of-3 Safe signatures and execute the scheduling transaction. Preserve
the printed SALT and OP_ID and the exact JSON. Do not regenerate the schedule:
the helper generates a new random salt on every invocation.

## 4. Wait for readiness, then execute

The 24-hour delay starts when scheduling confirms on-chain, not when the JSON
is generated or the Safe signatures are collected.

```powershell
$env:SALT = '<saved schedule salt>'
$env:OP_ID = '<saved schedule operation id>'
$env:ACTION = 'execute'
npx.cmd hardhat run scripts/governance/prepare_v931_upgrade.js --network base
```

Retain the same STAKING_V931_IMPL and AUTOCLAIM_EXECUTOR values in this shell.
The script checks readiness and the exact operation ID, then writes unsigned
execution JSON. Import into the Safe and sign/execute. Execution is permissionless
after readiness, so an ordinary account could also execute the exact scheduled
operation; it cannot change the scheduled candidate or initialization data.

## 5. Verify upgrade and record its receipt block

Confirm the ERC-1967 implementation points to the deployed candidate, version()
is 9.3.1, owner() is still the Timelock, and autoClaimExecutor() matches the smart
account above. Compare representative stakes, totals and historical checkpoints
with a pre-upgrade snapshot. Preserve the successful upgrade receipt.

Use that receipt's block number as AUTOCLAIM_START_BLOCK in local configuration
and the GitHub repository variable. Do NOT use the staking contract's legacy
upgradeBlock(): it intentionally still anchors the older V9.3 checkpoints.

```powershell
gh variable set AUTOCLAIM_START_BLOCK --repo jdmaverick369/obn-frontend --body '<actual V9.3.1 execution block>'
gh workflow run monthly_autoclaim.yml --repo jdmaverick369/obn-frontend --ref main -f send=false
```

With automation disabled this runs only readiness validation, not worker indexing.
Wait for the upgrade block to finalize before the worker indexes it.

## 6. Controlled mainnet claim before scheduling

Have one existing staker explicitly opt in on-chain. The new frontend opt-in UI
is still local, so use a reviewed wallet call to setAutoClaimEnabled(true) or
release/test that UI separately. Run a local dry run against the production
proxy, then one sponsored batch with AUTOCLAIM_MAX_CLAIMS=1. Keep GitHub disabled
and use one operator process to avoid competing for the same executor nonce.
Verify the actual intended wallet/pools in the dry run before submitting.

From C:\obn-frontend\scripts\autoclaim:

```powershell
$env:AUTOCLAIM_MAX_CLAIMS = '1'
$env:AUTOCLAIM_SEND = 'false'
node --env-file=../../.env.local run.mjs
# After checking the dry-run result:
$env:AUTOCLAIM_SEND = 'true'
node --env-file=../../.env.local run.mjs
$env:AUTOCLAIM_SEND = 'false'
```

Verify the UserOperation receipt, nonzero paymaster, claim events, destinations
and monthly records. Resolve all uncertain submissions before handing control to
GitHub. Preserve/transfer the local journal when moving to the scheduled worker;
never discard an unresolved operation.

## 7. Enable scheduling and monitor

Once the controlled claim is confirmed and worker journal handover is complete:

```powershell
gh variable set AUTOCLAIM_ENABLED --repo jdmaverick369/obn-frontend --body true
```

This permits daily scheduled submissions at 09:23 UTC. The contract enforces
monthly eligibility. The current per-run cap is 100 wallet batches; the reported
CDP policy allows the shared executor 300 operations/$10 monthly. Monitor failures,
remaining quotas, pending jobs and opted-in wallets awaiting their monthly claim.
If needed, set AUTOCLAIM_ENABLED=false to stop new scheduled runs (an in-flight
run must be stopped separately; already broadcast transactions may still execute).
On-chain global executor revocation requires the owner/Timelock process.
