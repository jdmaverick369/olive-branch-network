import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyEvent, advanceDay, totals, setBalance, snapshot, baseTimestamp, dayOf } from './core.mjs';

const unit = 10n ** 18n;
const start = Date.parse('2025-09-01T12:00:00Z') / 1000;
const event = (name, user, pid, amount) => ({ name, args: { user, pid, amount } });

test('verified Base clock assigns midnight correctly and rejects changed cadence', () => {
  const anchor = { number: 100, timestamp: Date.parse('2026-01-01T23:59:58Z') / 1000 };
  const end = { number: 103, timestamp: anchor.timestamp + 6 };
  assert.equal(dayOf(baseTimestamp(anchor, end, 100)), '2026-01-01');
  assert.equal(dayOf(baseTimestamp(anchor, end, 101)), '2026-01-02');
  assert.equal(baseTimestamp(anchor, { ...end, timestamp: end.timestamp + 1 }, 101), null);
  assert.equal(baseTimestamp(anchor, end, 104), null);
});

test('counts distinct wallets across pools, partial withdrawals and full exits', () => {
  const state = initialState(100, start);
  applyEvent(state, event('Deposit', '0xAlice', 0n, 10n * unit));
  applyEvent(state, event('Deposit', '0xALICE', 1n, 20n * unit));
  applyEvent(state, event('Deposit', '0xBob', 0n, 5n * unit));
  assert.deepEqual(totals(state), { staked: 35n * unit, active: 2 });
  applyEvent(state, event('Withdraw', '0xAlice', 0n, 10n * unit));
  applyEvent(state, event('Withdraw', '0xBob', 0n, 3n * unit));
  assert.deepEqual(totals(state), { staked: 22n * unit, active: 2 });
  applyEvent(state, event('Withdraw', '0xAlice', 1n, 20n * unit));
  assert.equal(totals(state).active, 1);
  assert.throws(() => applyEvent(state, event('Withdraw', '0xBob', 0n, 3n * unit)), /Negative stake/);
});

test('fills quiet UTC days and combines only actual charity distributions', () => {
  const state = initialState(100, start);
  applyEvent(state, event('Deposit', '0xAlice', 0n, unit));
  applyEvent(state, event('CharityDistributed', null, 0n, 2n * unit));
  applyEvent(state, event('CharityFundDistributed', null, null, unit));
  applyEvent(state, event('CharityAllocated', null, 0n, 50n * unit));
  advanceDay(state, start + 3 * 86400);
  assert.deepEqual(state.rows.map(r => r.day), ['2025-09-01', '2025-09-02', '2025-09-03']);
  assert.ok(state.rows.every(r => r.totalContributed === 3 && r.totalStaked === 1));
  applyEvent(state, event('Withdraw', '0xAlice', 0n, unit));
  const output = snapshot(state, { number: 300, timestamp: start + 3 * 86400 });
  assert.equal(output.rows.at(-1).activeStakers, 0);
  assert.equal(output.rows[0].activeStakers, 1);
});

test('balance corrections handle a migrated nonprofit that stakes in another pool', () => {
  const state = initialState(100, start);
  setBalance(state, 0n, '0xOld', 5n * unit);
  setBalance(state, 1n, '0xNew', 2n * unit);
  assert.equal(totals(state).active, 2);
  setBalance(state, 0n, '0xOld', 0n);
  setBalance(state, 0n, '0xNew', 5n * unit);
  assert.deepEqual(totals(state), { staked: 7n * unit, active: 1 });
});

test('checkpoint round-trip preserves exact token amounts and resumes daily series', () => {
  let state = initialState(100, start);
  const amount = 12345678901234567890123456789n;
  applyEvent(state, event('Deposit', '0xAlice', 0n, amount));
  advanceDay(state, start + 86400);
  state = JSON.parse(JSON.stringify(state));
  applyEvent(state, event('Withdraw', '0xAlice', 0n, amount - 1n));
  advanceDay(state, start + 2 * 86400);
  assert.equal(totals(state).staked, 1n);
  assert.equal(state.rows.length, 2);
});

test('counts own-pool nonprofit claims once and follows wallet changes in log order', () => {
  let state = initialState(100, start);
  const add = (pid, charityWallet) => applyEvent(state, { name: 'PoolAdded', args: { pid, charityWallet } });
  const claim = (user, pid, amountUser) => applyEvent(state, { name: 'Claim', args: { user, pid, amountUser } });
  add(0n, '0xOld');
  add(1n, '0xOther');
  applyEvent(state, event('Deposit', '0xOld', 0n, 1000000n * unit));
  claim('0xOLD', 0n, 88n * unit);
  claim('0xStaker', 0n, 88n * unit);
  claim('0xOld', 1n, 88n * unit); // A nonprofit staking in another pool is not its seed position.
  applyEvent(state, event('CharityDistributed', null, 0n, 10n * unit));
  applyEvent(state, event('CharityFundDistributed', null, null, unit));
  assert.equal(state.contributed, (99n * unit).toString());
  assert.equal(state.seedClaims, (88n * unit).toString());
  advanceDay(state, start + 86400);
  state = JSON.parse(JSON.stringify(state));
  applyEvent(state, { name: 'CharityWalletUpdated', args: { pid: 0n, oldWallet: '0xOld', newWallet: '0xNew' } });
  claim('0xOld', 0n, 100n * unit);
  claim('0xNew', 0n, 2n * unit);
  assert.equal(state.contributed, (101n * unit).toString());
  assert.equal(state.rows[0].totalContributed, 99);
  applyEvent(state, { name: 'PoolRemoved', args: { pid: 0n } });
  applyEvent(state, { name: 'CharityWalletUpdated', args: { pid: 0n, oldWallet: '0xNew', newWallet: '0xTreasury' } });
  claim('0xTreasury', 0n, unit);
  assert.equal(state.contributed, (101n * unit).toString());
  assert.throws(() => claim('0xNew', 99n, unit), /Missing charity wallet/);
});
