import assert from 'node:assert/strict';
import { test } from 'node:test';
import { corpus } from './command-corpus.mjs';
import { parseCommand, isActionCommand, mergeCommandDraft, commandSuggestions } from '../src/lib/commandParser.ts';
import { POOLS } from '../src/lib/pools.ts';

test('realistic phrase corpus', () => {
  const failures = [];
  for (const row of corpus) {
    const actual = parseCommand(row.input, POOLS, row.context);
    try { assert.deepEqual(actual, row.expected); }
    catch { failures.push({ ...row, actual }); }
  }
  console.log(`Corpus: ${corpus.length - failures.length}/${corpus.length} passed (${((corpus.length - failures.length) / corpus.length * 100).toFixed(1)}%)`);
  assert.ok(corpus.length >= 300);
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});

test('action invariants over corpus and adversarial variations', () => {
  const live = new Set(POOLS.filter(p => p.live).map(p => p.pid));
  for (const { input, context } of corpus) {
    const cmd = parseCommand(input, POOLS, context);
    if (!isActionCommand(cmd)) continue;
    for (const pid of [cmd.pid, cmd.from, cmd.to, ...(cmd.pids ?? []), ...(cmd.pick?.pids ?? [])]) {
      if (pid != null) assert.ok(live.has(pid), input);
    }
    if (cmd.amount && cmd.amount.unit !== 'all') {
      assert.ok(Number.isFinite(Number(cmd.amount.value)) && Number(cmd.amount.value) > 0, input);
      if (cmd.amount.unit === 'percent') assert.ok(Number(cmd.amount.value) <= 100, input);
    }
    assert.doesNotMatch(input, /\b(?:don't|do not|never|if|suppose|imagine)\b/i);
  }
  const actions = ['stake 100 to Tor', 'unstake all from Tor', 'claim all', 'move 100 from Tor to Khan', 'stake 100 to each nonprofit', 'enable autoclaim', 'disable autoclaim'];
  for (const action of actions) for (const prefix of ["don't ", 'do not ', 'never ', 'I might ', 'what if I ', 'suppose I ', 'imagine I ', 'can you explain how to ', 'yesterday I ']) {
    for (const context of [{}, { pending: 'stake', lastPid: 6 }, { pending: 'move' }]) {
      assert.equal(isActionCommand(parseCommand(prefix + action, POOLS, context)), false, prefix + action);
    }
  }
  for (const input of ['stake 100 to tor and nonsense', 'move 100 from tor to khan and claim all', 'stake 100 each to tor and 200 each to khan', 'stake 100 to pool 999', 'how can I move 100 from tor to khan?', 'no stake 100 to tor', 'turn on auto claim and stake 100 to tor', 'enable and disable autoclaim', 'move 100 from tor from khan', 'move 100 tor khan']) {
    assert.equal(isActionCommand(parseCommand(input, POOLS)), false, input);
  }
});

test('every live pool resolves from metadata full and short names', () => {
  for (const p of POOLS.filter(p => p.live)) for (const name of [p.name, p.shortName]) {
    assert.ok(name);
    assert.deepEqual(parseCommand(`stake 100 to ${name}`, POOLS), { kind: 'stake', pid: p.pid, amount: { unit: 'obn', value: '100' } });
  }
});

test('category synonyms, future pools and ambiguity never broaden an action', () => {
  for (const [category, synonyms] of [
    ['humanitarian', ['people', 'human', 'humanitarian causes']],
    ['environment', ['environmental', 'climate', 'nature', 'planet', 'green', 'conservation']],
    ['animals', ['animal welfare', 'animal', 'pets', 'dogs', 'wildlife']],
  ]) for (const synonym of synonyms) {
    const pids = POOLS.filter(p => p.live && p.category === category).map(p => p.pid);
    assert.deepEqual(parseCommand(`stake 100 to each ${synonym} nonprofit`, POOLS), { kind: 'stakeEach', pids, split: false, amount: { unit: 'obn', value: '100' } });
  }
  const future = [...POOLS, { pid: 100, name: 'Animal Haven', shortName: 'Haven', category: 'animals', live: true }, { pid: 101, name: 'Closed Refuge', category: 'animals', live: false }];
  assert.deepEqual(parseCommand('stake 100 to each animal nonprofit', future).pids, [10, 100]);
  const ambiguous = parseCommand('stake 100 to animals', future);
  assert.equal(ambiguous.kind, 'clarify');
  assert.deepEqual(ambiguous.pids, [10, 100]);
  assert.equal(parseCommand(ambiguous.input.replace('{pool}', 'pool 100'), future).pid, 100);
  const twins = [{ pid: 200, name: 'Hope Care', live: true }, { pid: 201, name: 'Hope Farm', live: true }, ...POOLS];
  for (const input of ['stake 100 to hope', 'unstake 100 from hope', 'claim from hope', 'move 100 from tor to hope', 'stake 100 each to hope and tor']) {
    const cmd = parseCommand(input, twins);
    assert.equal(cmd.kind, 'clarify', input);
    assert.deepEqual(cmd.pids, [200, 201]);
  }
  for (const amount of ['€5', '10,0000', '-100']) {
    const cmd = parseCommand(`stake ${amount} to hope`, twins);
    assert.equal(cmd.kind, 'clarify');
    assert.equal(parseCommand(cmd.input.replace('{pool}', 'pool 200'), twins).amount, null);
  }
  assert.equal(parseCommand('stake 100 to animals', POOLS).pid, 10);
  assert.equal(parseCommand('stake 100 to Tor in environmental causes', POOLS).kind, 'unknown');
});

test('draft edits preserve intent and reject stale amounts', () => {
  const draft = { kind: 'stake', pid: 7, amount: { unit: 'obn', value: '100' } };
  const edit = input => mergeCommandDraft(input, parseCommand(input, POOLS, { pending: draft.kind }), draft);
  assert.deepEqual(edit('no, I meant Tor'), { ...draft, pid: 6 });
  assert.deepEqual(edit('no, I meant K9 Rescue'), { ...draft, pid: 10 });
  assert.deepEqual(edit('make it 500 instead'), { ...draft, amount: { unit: 'obn', value: '500' } });
  assert.deepEqual(edit('make it 10,0000 instead'), { ...draft, amount: null });
  assert.deepEqual(edit('stake 200'), { kind: 'stake', pid: null, amount: { unit: 'obn', value: '200' } });
  assert.equal(edit('what if I stake 100 to Tor?').kind, 'unknown');
  assert.equal(parseCommand('stake 100 to it', POOLS).kind, 'unknown');
  assert.equal(parseCommand('stake 100 to it', POOLS, { lastPid: 999 }).kind, 'unknown');
  const move = { kind: 'move', from: 6, to: 4, amount: { unit: 'obn', value: '100' } };
  assert.equal(mergeCommandDraft('no, I meant St Jude', parseCommand('no, I meant St Jude', POOLS, { pending: 'move' }), move).kind, 'unknown');
});

test('currency prefixes and unsupported currencies cannot become token amounts', () => {
  for (const amount of ['dollars 5', 'USD5', '5 USD', '$5']) assert.deepEqual(parseCommand(`stake ${amount} to tor`, POOLS).amount, { unit: 'usd', value: '5' });
  for (const amount of ['€5', '£5', '5 ETH', '5 USDC']) assert.equal(parseCommand(`stake ${amount} to tor`, POOLS).amount, null);
});

test('suggestions stay supported and never confirm', () => {
  for (const input of ['tor nonsense', 'unstak please', 'rewards claim', 'auto settings', '🫒']) {
    const suggestions = commandSuggestions(input, POOLS);
    assert.ok(suggestions.length >= 1 && suggestions.length <= 3);
    for (const suggestion of suggestions) assert.ok(!['unknown', 'confirm'].includes(parseCommand(suggestion, POOLS).kind), suggestion);
  }
});
