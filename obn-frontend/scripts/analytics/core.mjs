import { formatUnits, Interface } from 'ethers';

export const STAKING = '0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2';
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
  return { schema: 2, chainId: 8453, contract: STAKING, startBlock,
    cursor: startBlock - 1, blockHash: null, balances: {}, contributed: '0',
    charityWallets: {}, removedPools: {}, seedClaims: '0',
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

// Finalize every elapsed UTC day, including days with no contract activity.
export function advanceDay(state, timestamp) {
  const target = dayOf(timestamp);
  if (target < state.day) throw new Error('Out-of-order block timestamp');
  while (state.day < target) {
    state.rows.push(row(state));
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
  } else if (name === 'PoolRemoved') {
    state.removedPools[args.pid] = true;
  } else if (name === 'CharityWalletUpdated') {
    if (state.charityWallets[args.pid] !== args.oldWallet.toLowerCase()) throw new Error('Incomplete charity wallet history');
    state.charityWallets[args.pid] = args.newWallet.toLowerCase();
  } else if (name === 'Claim') {
    const charity = state.charityWallets[args.pid];
    if (!charity) throw new Error('Missing charity wallet for claim');
    // A nonprofit's own-pool reward is a separate mint from the 10%/1% slices.
    // Follow the wallet at this exact log position, including wallet migrations.
    if (!state.removedPools[args.pid] && args.user.toLowerCase() === charity) {
      state.seedClaims = (BigInt(state.seedClaims) + args.amountUser).toString();
      state.contributed = (BigInt(state.contributed) + args.amountUser).toString();
    }
  } else if (name === 'Deposit' || name === 'Withdraw') {
    const key = `${args.pid}:${args.user.toLowerCase()}`;
    setBalance(state, args.pid, args.user, BigInt(state.balances[key] ?? '0') +
      (name === 'Deposit' ? args.amount : -args.amount));
  } else if (name === 'CharityDistributed' || name === 'CharityFundDistributed') {
    state.contributed = (BigInt(state.contributed) + args.amount).toString();
  }
}

export function snapshot(state, block, generatedAt = new Date().toISOString()) {
  return { schema: 1, chainId: 8453, contract: STAKING, generatedAt,
    throughBlock: block.number, throughTimestamp: new Date(block.timestamp * 1000).toISOString(),
    definitions: {
      activeStakers: 'Distinct wallets with positive stake across all pools, including nonprofit bootstrap stakes.',
      totalStaked: 'OBN currently staked across all pools.',
      totalContributed: 'Cumulative nonprofit own-pool Claim rewards plus CharityDistributed and CharityFundDistributed OBN; excludes seed principal, unminted rewards and direct donations.',
    }, rows: [...state.rows, row(state)] };
}
