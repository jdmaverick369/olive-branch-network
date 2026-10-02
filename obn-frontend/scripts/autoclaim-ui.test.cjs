// Offline UI regressions against the production TypeScript hook and components.
// React lifecycle and Wagmi I/O are deterministic fixtures: no RPC, signatures,
// or transactions leave this process. Run from the frontend or set OBN_FRONTEND_ROOT.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const candidates = [process.env.OBN_FRONTEND_ROOT, path.resolve(__dirname, '..'), process.cwd()].filter(Boolean);
const root = candidates.find(candidate => fs.existsSync(path.join(candidate, 'src/components/MonthlyAutoClaim.tsx')));
assert.ok(root, 'Run from the frontend or set OBN_FRONTEND_ROOT to the frontend directory');
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
const viem = req('viem');
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const EXECUTOR = '0x3333333333333333333333333333333333333333';
const STAKING = '0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2';
const BUILDER_SUFFIX = '0x62635f79386777317961610b0080218021802180218021802180218021';
const source = fs.readFileSync(path.join(root, 'src/components/MonthlyAutoClaim.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
global.fetch = async () => { throw new Error('Network forbidden in autoclaim UI regression tests'); };
require('node:net').Socket.prototype.connect = function () { throw new Error('Network forbidden in autoclaim UI regression tests'); };

function runtime() { return { slots: [], cursor: 0, effects: [], dirty: false }; }
function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  return textContent(node.props?.children);
}
function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(child => findElement(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

function harness(options = {}) {
  const state = {
    address: A, chainId: 8453, enabled: false, known: true, executor: EXECUTOR,
    stake: true, stakeKnown: true, viewOnly: false, viewed: null, sponsored: false,
    requests: [], reads: [], refetches: [], connections: 0, guardErrors: [], ...options,
  };
  const storage = new Map();
  const hookRuntime = runtime();
  let active = hookRuntime;
  const React = {
    useState(initial) {
      const owner = active, index = owner.cursor++;
      if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [owner.slots[index], value => {
        const next = typeof value === 'function' ? value(owner.slots[index]) : value;
        if (!Object.is(next, owner.slots[index])) { owner.slots[index] = next; owner.dirty = true; }
      }];
    },
    useRef(value) {
      const index = active.cursor++;
      if (!(index in active.slots)) active.slots[index] = { current: value };
      return active.slots[index];
    },
    useEffect(effect, deps) {
      const owner = active, index = owner.cursor++, prior = owner.slots[index];
      if (!prior || !deps || deps.some((value, i) => !Object.is(value, prior.deps?.[i]))) {
        owner.effects.push(() => { prior?.cleanup?.(); owner.slots[index] = { deps, cleanup: effect() }; });
      }
    },
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); },
  };
  const abiModule = { exports: {} };
  const abiJs = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/autoClaimAbi.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', abiJs)(req, abiModule, abiModule.exports);
  const abi = abiModule.exports.autoClaimAbi;
  function queryValue(name) {
    if (name === 'autoClaimPreference') return state.known ? [state.enabled, 0n] : undefined;
    if (name === 'autoClaimExecutor') return state.executor;
    if (name === 'activePoolCount') return state.stakeKnown ? (state.stake ? 1n : 0n) : undefined;
    throw new Error(`Unexpected read: ${name}`);
  }
  function queryError(name) {
    if (name === 'autoClaimPreference') return state.readError;
    if (name === 'autoClaimExecutor') return state.executorError;
    return state.stakeError;
  }
  const wagmi = {
    useAccount: () => ({ address: state.address, chainId: state.chainId }),
    useWalletClient: () => ({ data: state.walletUnavailable ? undefined : {} }),
    useCapabilities: () => ({ data: state.sponsored ? { 8453: { paymasterService: { supported: true } } } : {} }),
    usePublicClient: () => ({ readContract: async args => {
      state.reads.push(args);
      if (state.readGate && (!state.readGateName || state.readGateName === args.functionName)) await state.readGate.promise;
      if (args.functionName === 'activePoolCount' && state.freshStakeError) throw state.freshStakeError;
      if (args.functionName === 'autoClaimPreference' && state.freshPreferenceError) throw state.freshPreferenceError;
      return queryValue(args.functionName);
    } }),
    useReadContract: args => ({
      data: queryValue(args.functionName),
      isError: !!queryError(args.functionName) || (args.functionName === 'autoClaimPreference' && !state.known),
      isSuccess: queryValue(args.functionName) !== undefined && !queryError(args.functionName),
      refetch: async () => {
        state.refetches.push(args.functionName);
        if (state.refetchGate) await state.refetchGate.promise;
        if (state.refetchThrows) throw state.refetchThrows;
        return { data: queryValue(args.functionName), error: queryError(args.functionName) };
      },
    }),
  };
  async function write(args) {
    state.requests.push(args);
    if (state.writeGate) await state.writeGate.promise;
    if (state.writeError) throw state.writeError;
    const desired = args.args?.[0] ?? viem.decodeFunctionData({ abi, data: args.calls[0].data }).args[0];
    if (desired && !state.stake) throw new Error('NotStaker');
    state.enabled = desired;
    return `0x${'ab'.repeat(32)}`;
  }
  const tx = {
    run: async (_label, task) => {
      if (state.guardError) throw state.guardError;
      try { await task(); } catch (error) { state.guardErrors.push(error); }
    },
    writeContractAsync: write, sendCallsAsync: write, pending: null,
  };
  const mocks = {
    react: React, wagmi, viem,
    '@/hooks/useWalletTransaction': { useWalletTransaction: () => tx, TransactionRecovery: () => null },
    '@/lib/transactionGuard': { readTransaction: () => state.journal ?? null },
    '@/lib/autoClaimAbi': { autoClaimAbi: abi }, '@/lib/contracts': { STAKING_PROXY: STAKING },
    '@/lib/builderCode': { DATA_SUFFIX: BUILDER_SUFFIX },
    '@/components/MiniAppWalletProvider': { useMiniAppWallet: () => ({
      viewAddress: state.viewed, viewOnly: state.viewOnly, connectViewed: async () => { state.connections++; },
    }) },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'localStorage', compiled)(
    name => name in mocks ? mocks[name] : req(name), module, module.exports,
    { env: { NODE_ENV: 'production', NEXT_PUBLIC_AUTOCLAIM_ENABLED: options.released === false ? 'false' : 'true',
      NEXT_PUBLIC_CHAIN_ID: '8453', NEXT_PUBLIC_PAYMASTER_URL: 'https://paymaster.example.invalid' } },
    { getItem: key => storage.get(key) ?? null, setItem: (key, value) => {
      if (state.restrictedStorage) throw new Error('Storage blocked'); storage.set(key, value);
    } },
  );
  function renderWith(owner, component) {
    let value;
    for (let iteration = 0; iteration < 10; iteration++) {
      active = owner; owner.cursor = 0; owner.effects = []; owner.dirty = false;
      value = component(); owner.effects.forEach(effect => effect());
      if (!owner.dirty) return value;
    }
    assert.fail('Hook did not settle after effects');
  }
  const render = () => renderWith(hookRuntime, module.exports.useMonthlyAutoClaim);
  return {
    state, storage, render, button: (control = render()) => module.exports.AutoClaimButton({ control }),
    dialog: (control = render()) => renderWith(runtime(), () => module.exports.AutoClaimDialog({ control })),
  };
}

test('Auto visibility and manual consent retain release, connection, and Base guards', () => {
  for (const options of [{ released: false }, { address: undefined }]) assert.equal(harness(options).render().visible, false);
  for (const options of [{ chainId: 1 }, { known: false }, { executor: viem.zeroAddress }]) {
    const h = harness(options); assert.equal(h.button().props.disabled, true); h.render().open(); assert.equal(h.render().prompt, null);
  }
  const h = harness(); h.render().open(); assert.equal(h.render().prompt.desired, true);
  assert.equal(h.render().prompt.automatic, false); h.render().close(); assert.equal(h.render().prompt, null);
  assert.equal(h.state.requests.length, 0); h.render().open(); assert.ok(h.render().prompt);
});

test('wallets without active stake see Stake first and cannot request enable', async () => {
  const h = harness({ stake: false });
  assert.equal(textContent(h.button()), 'Stake first'); assert.equal(h.button().props.disabled, true);
  h.render().open(); await h.render().confirm(); await h.render().promptAfterSuccess(A);
  assert.equal(h.render().prompt, null); assert.equal(h.state.requests.length, 0);
});

test('unknown, failed, and stale failed stake reads block enabling until a successful read', () => {
  for (const options of [{ stakeKnown: false }, { stakeError: new Error('RPC unavailable') }, { stake: false, stakeError: new Error('RPC unavailable') }]) {
    const h = harness(options); assert.equal(h.button().props.disabled, true); h.render().open(); assert.equal(h.render().prompt, null);
    h.state.stakeKnown = true; h.state.stakeError = undefined; h.state.stake = true;
    assert.equal(h.button().props.disabled, false); h.render().open(); assert.ok(h.render().prompt);
  }
});

test('disabling works after complete withdrawal, paused executor, and unreadable stake state', async () => {
  for (const sponsored of [false, true]) {
    const h = harness({ enabled: true, stake: false, stakeKnown: false, stakeError: new Error('RPC unavailable'), executor: viem.zeroAddress, sponsored });
    assert.equal(textContent(h.button()), 'Auto On'); assert.equal(h.button().props.disabled, false);
    h.render().open(); assert.equal(h.render().prompt.desired, false); await h.render().confirm();
    assert.equal(h.state.enabled, false); assert.equal(h.state.requests.length, 1); assert.equal(h.render().busy, false);
    assert.equal(h.state.reads.some(args => args.functionName === 'activePoolCount'), false);
  }
});

test('last stake withdrawn after opening consent is caught before a wallet request', async () => {
  const h = harness(); h.render().open(); const confirm = h.render().confirm;
  h.state.stake = false; await confirm();
  assert.equal(h.state.requests.length, 0); assert.match(h.render().message, /stake first/i); assert.equal(h.render().busy, false);
});

test('an open enable dialog explains and blocks eligibility loss while allowing dismissal', async () => {
  for (const update of [state => { state.stake = false; }, state => { state.stakeError = new Error('RPC unavailable'); }]) {
    const h = harness(); h.render().open(); update(h.state);
    const dialog = h.dialog();
    const yes = findElement(dialog, node => node.type === 'button' && textContent(node) === 'Yes');
    assert.equal(yes.props.disabled, true); assert.match(textContent(dialog), /stake first|staking status is unavailable/i);
    await h.render().confirm(); assert.equal(h.state.requests.length, 0);
    h.render().close(); assert.equal(h.render().prompt, null);
  }
});

test('fresh stake preflight read failure cannot initiate either wallet transaction path', async () => {
  for (const sponsored of [false, true]) {
    const h = harness({ sponsored, freshStakeError: new Error('RPC unavailable') }); h.render().open(); await h.render().confirm();
    assert.equal(h.state.requests.length, 0); assert.equal(h.render().busy, false); assert.ok(h.render().message);
    h.state.freshStakeError = undefined; await h.render().confirm(); assert.equal(h.state.requests.length, 1);
  }
});

test('view-only Auto connects the selected verified wallet before any consent or write', async () => {
  const h = harness({ viewed: B, viewOnly: true, stake: false });
  assert.equal(h.button().props.disabled, false); h.render().open(); await tick();
  assert.equal(h.state.connections, 1); assert.equal(h.render().prompt, null); assert.equal(h.state.requests.length, 0);
});

test('automatic consent requires matching wallet, enabled service, successful reads, and stake', async () => {
  for (const options of [{}, { enabled: true }, { executor: viem.zeroAddress }, { viewOnly: true }, { stake: false },
    { readError: new Error('RPC') }, { stakeError: new Error('RPC') }, { executorError: new Error('RPC') }]) {
    const h = harness(options); await h.render().promptAfterSuccess(A);
    assert.equal(!!h.render().prompt, Object.keys(options).length === 0);
  }
  const h = harness(); await h.render().promptAfterSuccess(B); assert.equal(h.render().prompt, null);
});

test('No permits future automatic consent; do-not-show is wallet scoped and manual control remains', async () => {
  for (const restrictedStorage of [false, true]) {
    const h = harness({ restrictedStorage }); await h.render().promptAfterSuccess(A); h.render().close();
    await h.render().promptAfterSuccess(A); assert.ok(h.render().prompt); h.render().close(true);
    await h.render().promptAfterSuccess(A); assert.equal(h.render().prompt, null);
    h.render().open(); assert.ok(h.render().prompt); h.render().close();
    h.state.address = B; await h.render().promptAfterSuccess(B); assert.ok(h.render().prompt);
  }
});

const contextChanges = {
  account: state => { state.address = B; return () => { state.address = A; }; },
  chain: state => { state.chainId = 1; return () => { state.chainId = 8453; }; },
  viewed: state => { state.viewed = B; return () => { state.viewed = null; }; },
  viewOnly: state => { state.viewOnly = true; return () => { state.viewOnly = false; }; },
};

test('account, chain, and verified-wallet context changes permanently clear old consent', () => {
  for (const change of Object.values(contextChanges)) {
    const h = harness(); h.render().open(); assert.ok(h.render().prompt);
    const restore = change(h.state); assert.equal(h.render().prompt, null);
    restore(); assert.equal(h.render().prompt, null); assert.equal(h.render().message, '');
    h.render().open(); assert.ok(h.render().prompt); assert.equal(h.state.requests.length, 0);
  }
});

test('an in-flight automatic refresh cannot restore consent after context changes away and back', async () => {
  for (const change of Object.values(contextChanges)) {
    const h = harness(), gate = deferred(); h.state.refetchGate = gate;
    const pending = h.render().promptAfterSuccess(A); await tick();
    const restore = change(h.state); h.render(); restore(); h.render(); gate.resolve(); await pending;
    assert.equal(h.render().prompt, null); assert.equal(h.state.requests.length, 0);
  }
});

test('an in-flight confirmation preflight is invalidated after context changes away and back', async () => {
  for (const change of Object.values(contextChanges)) {
    const h = harness(), gate = deferred(); h.state.readGate = gate;
    h.render().open(); const pending = h.render().confirm(); await tick();
    const restore = change(h.state); h.render(); restore(); h.render(); gate.resolve(); await pending;
    assert.equal(h.state.requests.length, 0); assert.equal(h.render().prompt, null); assert.equal(h.render().busy, false);
  }
});

test('normal and sponsored changes bind Base/account and confirm both enable and disable', async () => {
  for (const sponsored of [false, true]) for (const enabled of [false, true]) {
    const h = harness({ sponsored, enabled }); h.render().open(); await h.render().confirm();
    assert.equal(h.state.enabled, !enabled); assert.equal(h.state.requests.length, 1);
    assert.equal(h.state.requests[0].account, A); assert.equal(h.state.requests[0].chainId, 8453);
    // Builder-code attribution on both wallet paths.
    if (sponsored) assert.deepEqual(h.state.requests[0].capabilities.dataSuffix, { value: BUILDER_SUFFIX, optional: true });
    else assert.equal(h.state.requests[0].dataSuffix, BUILDER_SUFFIX);
    assert.equal(h.render().prompt, null); assert.equal(h.render().busy, false);
    if (!enabled) assert.ok(h.state.reads.some(args => args.functionName === 'activePoolCount' && args.args[0] === A));
  }
});

test('already-confirmed preference closes consent without another transaction', async () => {
  const h = harness(); h.render().open(); h.state.enabled = true; await h.render().confirm();
  assert.equal(h.state.requests.length, 0); assert.equal(h.render().prompt, null); assert.equal(h.render().busy, false);
});

test('pending confirmation prevents duplicate requests and cancellation until settled', async () => {
  const h = harness(), gate = deferred(); h.state.writeGate = gate; h.render().open();
  const pending = h.render().confirm(); await tick(); assert.equal(h.render().busy, true);
  await h.render().confirm(); h.render().close(); assert.ok(h.render().prompt); assert.equal(h.state.requests.length, 1);
  const yes = findElement(h.dialog(), node => node.type === 'button' && /Confirming/.test(textContent(node)));
  assert.equal(yes.props.disabled, true); gate.resolve(); await pending; assert.equal(h.render().busy, false);
});

test('definite direct and nested wallet rejection report Change cancelled for normal and sponsored requests', async () => {
  for (const sponsored of [false, true]) for (const nested of [false, true]) {
    const rejection = new viem.UserRejectedRequestError(new Error('User rejected the request'));
    const writeError = nested ? new viem.BaseError('Contract request failed', { cause: rejection }) : rejection;
    const h = harness({ sponsored, writeError }); h.render().open(); await h.render().confirm();
    assert.equal(h.render().message, 'Change cancelled.'); assert.equal(h.state.enabled, false);
    assert.equal(h.render().busy, false); assert.ok(h.render().prompt);
    h.state.writeError = undefined; await h.render().confirm(); assert.equal(h.state.enabled, true);
  }
});

test('unknown confirmation, timeout, and merely rejection-worded errors retain cautious recovery copy', async () => {
  for (const writeError of [new Error('RPC confirmation timed out'), new Error('Connection lost'), new Error('Server rejected transaction')]) {
    const h = harness({ writeError }); h.render().open(); await h.render().confirm();
    assert.notEqual(h.render().message, 'Change cancelled.'); assert.match(h.render().message, /could not confirm|check.*wallet/i);
    assert.equal(h.render().busy, false); assert.equal(h.state.enabled, false); assert.ok(h.render().prompt);
  }
});

test('a rejection-shaped confirmation error cannot erase uncertainty after a hash or batch ID exists', async () => {
  for (const journal of [{ hash: `0x${'cd'.repeat(32)}` }, { callsId: 'submitted-batch' }]) {
    const h = harness({ journal, writeError: new viem.UserRejectedRequestError(new Error('RPC rejected confirmation')) });
    h.render().open(); await h.render().confirm();
    assert.notEqual(h.render().message, 'Change cancelled.'); assert.match(h.render().message, /could not confirm|check.*wallet/i);
    assert.equal(h.render().busy, false); assert.ok(h.render().prompt);
  }
});

test('outer transaction-lock failures release loading controls and allow retry or dismissal', async () => {
  const h = harness({ guardError: new Error('Web Locks unavailable') }); h.render().open(); await h.render().confirm();
  assert.equal(h.render().busy, false); assert.ok(h.render().message); assert.equal(h.state.requests.length, 0);
  h.render().close(); assert.equal(h.render().prompt, null); h.state.guardError = undefined;
  h.render().open(); await h.render().confirm(); assert.equal(h.state.requests.length, 1); assert.equal(h.state.enabled, true);
});

test('a failed error-path refresh cannot strand confirmation controls', async () => {
  const h = harness({ writeError: new Error('RPC timeout'), refetchThrows: new Error('Refresh failed') });
  h.render().open(); await h.render().confirm(); assert.equal(h.render().busy, false);
  h.render().close(); assert.equal(h.render().prompt, null);
});

test('enable copy explains the 14th UTC, no immediate claim, and late opt-in waiting until next month', () => {
  const h = harness(); h.render().open(); const copy = textContent(h.dialog());
  assert.match(copy, /14th.*UTC/i); assert.match(copy, /does not.*(?:immediate|right away)|(?:does not|won.t).*claim.*immediate|no immediate/i);
  assert.match(copy, /after.*processing.*next month/i);
  h.render().close(); h.state.enabled = true; h.render().open();
  assert.match(textContent(h.dialog()), /claim manually/i);
});
