import { formatUnits, Interface } from 'ethers';

export const STAKING = '0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2';
export const GOVERNANCE = '0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270';
export const LENS = '0x2ae4df523040c0245a6F84342E4B06850c5bdb9b';
export const governanceAbi = new Interface([
  'event Phase2Executed(uint256 indexed cycleId, address indexed winner, uint256 amount)',
]);
export const governanceTopic = governanceAbi.getEvent('Phase2Executed').topicHash;
export const abi = new Interface([
  'event Deposit(address indexed user, uint256 indexed pid, uint256 amount)',
  'event Withdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event PoolAdded(uint256 indexed pid, address charityWallet)',
  'event PoolRemoved(uint256 indexed pid)',
  'event Claim(address indexed user, uint256 indexed pid, uint256 amountUser)',
  'event CharityDistributed(uint256 indexed pid, uint256 amount)',
  'event CharityFundDistributed(uint256 amount)',
  'event CharityWalletUpdated(uint256 indexed pid, address indexed oldWallet, address indexed newWallet)',
  'function userAmount(uint256,address) view returns (uint256)',
  'function globalTotalStaked() view returns (uint256)',
  'function uniqueStakersGlobal() view returns (uint256)',
  'function listPoolsBasic() view returns (address[],uint256[],uint256[])',
]);
export const topics = abi.fragments.filter(f => f.type === 'event').map(f => f.topicHash);
export const dayOf = timestamp => new Date(timestamp * 1000).toISOString().slice(0, 10);
const nextDay = day => dayOf(Date.parse(`${day}T00:00:00Z`) / 1000 + 86400);

// Base's full-block clock is fixed at two seconds (Flashblocks are subdivisions).
// Use only when real range anchors agree; future cadence changes fall back to RPC headers.
export function baseTimestamp(start, end, number) {
  if (number < start.number || number > end.number ||
      end.timestamp - start.timestamp !== 2 * (end.number - start.number)) return null;
  return start.timestamp + 2 * (number - start.number);
}

export function initialState(startBlock, startTimestamp) {
  return { schema: 3, chainId: 8453, contract: STAKING, governance: GOVERNANCE, startBlock,
    cursor: startBlock - 1, blockHash: null, balances: {}, contributed: '0',
    charityWallets: {}, removedPools: {}, seedClaims: '0',
    pools: {}, annualCycles: {},
    day: dayOf(startTimestamp), rows: [], logRange: null };
}

export function totals(state) {
  const wallets = new Map();
  let staked = 0n;
  for (const [key, value] of Object.entries(state.balances)) {
    const amount = BigInt(value);
    const wallet = key.split(':')[1];
    wallets.set(wallet, (wallets.get(wallet) ?? 0n) + amount);
    staked += amount;
  }
  return { staked, active: [...wallets.values()].filter(v => v > 0n).length };
}

export function row(state) {
  const { staked, active } = totals(state);
  return { day: state.day, activeStakers: active,
    totalStaked: Number(formatUnits(staked, 18)),
    totalContributed: Number(formatUnits(state.contributed, 18)) };
}

export function poolActiveCounts(state) {
  const counts = {};
  for (const [key, value] of Object.entries(state.balances)) {
    const pid = key.split(':')[0];
    if (BigInt(value) > 0n) counts[pid] = (counts[pid] || 0) + 1;
  }
  return counts;
}

// Finalize every elapsed UTC day, including days with no contract activity.
export function advanceDay(state, timestamp) {
  const target = dayOf(timestamp);
  if (target < state.day) throw new Error('Out-of-order block timestamp');
  while (state.day < target) {
    state.rows.push(row(state));
    const counts = poolActiveCounts(state);
    for (const [pid, pool] of Object.entries(state.pools)) {
      pool.rows.push({ day: state.day, activeStakers: counts[pid] || 0 });
    }
    state.day = nextDay(state.day);
  }
}

export function setBalance(state, pid, wallet, amount) {
  if (amount < 0n) throw new Error(`Negative stake for pool ${pid}, wallet ${wallet}: incomplete history; refusing to publish`);
  const key = `${pid}:${wallet.toLowerCase()}`;
  if (amount === 0n) delete state.balances[key];
  else state.balances[key] = amount.toString();
}

export function applyEvent(state, event) {
  const { name, args } = event;
  if (name === 'PoolAdded') {
    if (state.charityWallets[args.pid] !== undefined) throw new Error('Duplicate pool creation');
    state.charityWallets[args.pid] = args.charityWallet.toLowerCase();
    state.pools[args.pid] = { contributions: '0', seedClaims: '0', annualAwards: '0',
      wallets: [args.charityWallet.toLowerCase()], rows: [] };
  } else if (name === 'PoolRemoved') {
    state.removedPools[args.pid] = true;
  } else if (name === 'CharityWalletUpdated') {
    if (state.charityWallets[args.pid] !== args.oldWallet.toLowerCase()) throw new Error('Incomplete charity wallet history');
    state.charityWallets[args.pid] = args.newWallet.toLowerCase();
    if (!state.removedPools[args.pid] && !state.pools[args.pid].wallets.includes(args.newWallet.toLowerCase())) {
      state.pools[args.pid].wallets.push(args.newWallet.toLowerCase());
    }
  } else if (name === 'Claim') {
    const charity = state.charityWallets[args.pid];
    if (!charity) throw new Error('Missing charity wallet for claim');
    // A nonprofit's own-pool reward is a separate mint from the 10%/1% slices.
    // Follow the wallet at this exact log position, including wallet migrations.
    if (!state.removedPools[args.pid] && args.user.toLowerCase() === charity) {
      state.seedClaims = (BigInt(state.seedClaims) + args.amountUser).toString();
      state.contributed = (BigInt(state.contributed) + args.amountUser).toString();
      const pool = state.pools[args.pid];
      pool.seedClaims = (BigInt(pool.seedClaims) + args.amountUser).toString();
    }
  } else if (name === 'Deposit' || name === 'Withdraw') {
    const key = `${args.pid}:${args.user.toLowerCase()}`;
    setBalance(state, args.pid, args.user, BigInt(state.balances[key] ?? '0') +
      (name === 'Deposit' ? args.amount : -args.amount));
  } else if (name === 'CharityDistributed' || name === 'CharityFundDistributed') {
    state.contributed = (BigInt(state.contributed) + args.amount).toString();
    if (name === 'CharityDistributed' && !state.removedPools[args.pid]) {
      const pool = state.pools[args.pid];
      if (!pool) throw new Error('Missing pool for contribution');
      pool.contributions = (BigInt(pool.contributions) + args.amount).toString();
    }
  } else if (name === 'Phase2Executed') {
    if (state.annualCycles[args.cycleId]) throw new Error('Duplicate annual payout cycle');
    state.annualCycles[args.cycleId] = true;
    if (args.amount === 0n) return;
    const winner = args.winner.toLowerCase();
    const matches = Object.entries(state.pools).filter(([, pool]) => pool.wallets.includes(winner));
    if (matches.length !== 1) throw new Error('Annual payout recipient cannot be attributed to one nonprofit pool');
    const pool = matches[0][1];
    pool.annualAwards = (BigInt(pool.annualAwards) + args.amount).toString();
    // The network series already counts inflows to the charity fund. Do not
    // count the fund's subsequent payout a second time in that series.
  }
}

export function snapshot(state, block, generatedAt = new Date().toISOString()) {
  const counts = poolActiveCounts(state);
  return { schema: 1, chainId: 8453, contract: STAKING, generatedAt,
    throughBlock: block.number, throughTimestamp: new Date(block.timestamp * 1000).toISOString(),
    definitions: {
      activeStakers: 'Distinct wallets with positive stake across all pools, including nonprofit bootstrap stakes.',
      totalStaked: 'OBN currently staked across all pools.',
      totalContributed: 'Cumulative nonprofit own-pool Claim rewards plus CharityDistributed and CharityFundDistributed OBN; excludes seed principal, unminted rewards and direct donations.',
    }, rows: [...state.rows, row(state)],
    pools: Object.fromEntries(Object.entries(state.pools).map(([pid, pool]) => [pid, {
      contributions: Number(formatUnits(pool.contributions, 18)),
      seedClaims: Number(formatUnits(pool.seedClaims, 18)),
      annualAwards: Number(formatUnits(pool.annualAwards, 18)),
      rows: [...pool.rows, { day: state.day, activeStakers: counts[pid] || 0 }],
    }])) };
}
