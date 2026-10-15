'use strict';
// Read-only wrapper around the pinned, rehearsed release generator.
// Usage: node scripts/governance/prepare_assembly_safe_files.cjs <reviewed-manifest.json> <assembly-proxy> <V2-implementation> <32-byte-salt> <new-output-directory>
// Requires actual deployed candidates. Never use local rehearsal addresses.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ethers } = require('ethers');

const [manifest, assembly, implementation, salt, output, ...extra] = process.argv.slice(2);
if (!manifest || !output || extra.length || !ethers.isAddress(assembly || '') ||
    !ethers.isAddress(implementation || '') || assembly === ethers.ZeroAddress ||
    implementation === ethers.ZeroAddress || !/^0x[0-9a-f]{64}$/i.test(salt || '')) {
  throw Error('Required: reviewed manifest, actual Assembly proxy, actual V2 implementation, 32-byte salt, NEW output directory. No transactions are sent.');
}
const manifestPath = path.resolve(manifest);
const out = path.resolve(output);
if (!fs.statSync(manifestPath).isFile()) throw Error('Manifest file required');
// Refuse to overwrite any previously reviewed signing material.
fs.mkdirSync(out, { recursive: false });
const bundlePath = path.join(out, 'review-bundle.json');
const child = spawnSync(process.execPath, [path.join(__dirname, 'prepare_assembly_upgrade.cjs'),
  'prepare', manifestPath, assembly, implementation, salt, bundlePath], {
  cwd: path.resolve(__dirname, '../..'), env: process.env, stdio: 'inherit',
});
if (child.error) throw child.error;
if (child.status !== 0) process.exit(child.status || 1);
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
// Export the generator's exact objects, without rebuilding or modifying calldata.
for (const [key, filename] of [['schedule', '01-schedule.safe.json'], ['execute', 'optional-execute-via-safe.json']]) {
  if (bundle[key]?.chainId !== '8453' || !Array.isArray(bundle[key]?.transactions) ||
      bundle[key].transactions.length !== 1) throw Error('Unexpected Safe batch');
  fs.writeFileSync(path.join(out, filename), JSON.stringify(bundle[key], null, 2) + '\n', { flag: 'wx' });
}
const execution = bundle.execute.transactions[0];
fs.writeFileSync(path.join(out, '02-execute-direct.json'), JSON.stringify({
  chainId: '8453', operationId: bundle.operationId,
  to: execution.to, value: execution.value, data: execution.data,
  note: 'Direct Timelock transaction, NOT a Safe import file. Before sending, confirm open EXECUTOR_ROLE and operation readiness. No second Safe approval is required while execution is open.',
}, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(out, 'READ-BEFORE-SIGNING.txt'),
  `Operation ID: ${bundle.operationId}\nPreflight Base block: ${bundle.checks.block}\n` +
  'Import 01-schedule.safe.json into the reviewed Base Safe Transaction Builder first.\n' +
  'After that transaction executes, wait for this Timelock operation to become ready (24-hour minimum).\n' +
  'Re-run live preflight; confirm the operation is pending/ready and not cancelled or executed.\n' +
  'Confirm EXECUTOR_ROLE is still open, then any wallet may submit the direct Timelock transaction in 02-execute-direct.json.\n' +
  'No second Safe approval is required with open execution. optional-execute-via-safe.json is only an alternative.\n' +
  'Review BaseScan verification and the pinned addresses/calldata before signing.\n' +
  'review-bundle.json is review evidence, NOT a Safe import file.\n' +
  'These files do not start the annual voting cycle or authorize deployment.\n', { flag: 'wx' });
console.log('Prepared Safe schedule, direct Timelock execution data, and optional Safe execution alternative. No transactions were signed or sent.');
