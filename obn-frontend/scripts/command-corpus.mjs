import { POOLS } from '../src/lib/pools.ts';

const obn = value => ({ unit: 'obn', value });
const stats = (metric, pids = [], rank = null) => ({ kind: 'stats', metric, pids, rank, limit: null, days: null });
export const corpus = [];
const add = (input, expected, context) => corpus.push({ input, expected, ...(context ? { context } : {}) });
const variants = (inputs, expected, context) => inputs.forEach(input => add(input, expected, context));

for (const pool of POOLS.filter(p => p.live)) {
  for (const [text, value] of [['100', '100'], ['1.5k', '1500'], ['2M', '2000000'], ['1,234.56', '1234.56'], ['ten thousand', '10000']]) {
    add(`stake ${text} to ${pool.name}`, { kind: 'stake', pid: pool.pid, amount: obn(value) });
    add(`please unstake ${text} from ${pool.name}`, { kind: 'unstake', pid: pool.pid, amount: obn(value) });
  }
  variants([`claim from ${pool.name}`, `collect from ${pool.name}`, `please harvest from ${pool.name}`], { kind: 'claim', pid: pool.pid });
  add(`how much is staked in ${pool.name}?`, stats('staked', [pool.pid]));
  add(`don't move 100 from ${pool.name} to Tor`, { kind: 'unknown', reason: 'negated' });
  add(`what happens if I unstake everything from ${pool.name}?`, { kind: 'unknown' });
  add(`I staked 100 in ${pool.name} yesterday`, { kind: 'unknown' });
}
for (const [text, amount] of [
  ['$1,234', { unit: 'usd', value: '1234' }], ['5 bucks', { unit: 'usd', value: '5' }],
  ['50 cents', { unit: 'usd', value: '0.5' }], ['usd 5', { unit: 'usd', value: '5' }], ['5 usd', { unit: 'usd', value: '5' }],
  ['half', { unit: 'percent', value: '50' }], ['a third', { unit: 'percent', value: '33.33' }], ['25%', { unit: 'percent', value: '25' }],
  ['all', { unit: 'all' }], ['everything', { unit: 'all' }], ['a million', obn('1000000')], ['1 000 000', obn('1000000')],
]) variants([`stake ${text} to tor`, `please stake ${text} to tor`, `can you stake ${text} to tor?`], { kind: 'stake', pid: 6, amount });
variants(['unstak 100 from tor', 'withdraw 100 from tor', 'please unstake 100 from tor'], { kind: 'unstake', pid: 6, amount: obn('100') });
variants(['stake 100 to st jud', 'STAKE 100 TO ST JUDE!!!', 'stkae 100 to st jude'], { kind: 'stake', pid: 7, amount: obn('100') });
variants(['stake 10,0000 to tor', 'stake -100 to tor', 'stake 1e3 to tor', 'stake 10kk to tor'], { kind: 'stake', pid: 6, amount: null });
variants(['claim all', 'collect everything', 'please harvest all rewards'], { kind: 'claim', pid: null, all: true });
variants(['move 100 from tor to khan', 'shift 100 from tor to khan', 'please move 100 from tor to khan'], { kind: 'move', from: 6, to: 4, amount: obn('100') });
variants(['stake 1M to each nonprofit', 'deposit 1M to every nonprofit', 'please stake 1M to each nonprofit'], { kind: 'stakeEach', pids: [], split: false, amount: obn('1000000') });
variants(['my balance', 'show my positions', 'what am I staking?'], { kind: 'status', pid: null });
variants(['Can you unstake 100 OBn from all the nonprofits..', 'unstake 100 from each nonprofit', 'withdraw 100 from every pool', 'please unstake 100 OBN from all of them'], { kind: 'unstakeEach', pids: [], split: false, amount: obn('100') });
variants(['unstake everything from all nonprofits', 'withdraw all from each nonprofit'], { kind: 'unstakeEach', pids: [], split: false, amount: { unit: 'all' } });
add('unstake 50% from each nonprofit', { kind: 'unstakeEach', pids: [], split: false, amount: { unit: 'percent', value: '50' } });
add('unstake 100 each from tor and khan', { kind: 'unstakeEach', pids: [6, 4], split: false, amount: obn('100') });
add("don't unstake from all the nonprofits", { kind: 'unknown', reason: 'negated' });
add('what happens if I unstake 100 from each nonprofit?', { kind: 'unknown' });
variants(['enable autoclaim', 'turn on auto claim', 'please enable auto claim'], { kind: 'autoclaim', mode: 'on' });
variants(['disable autoclaim', 'turn off auto claim', 'stop auto claiming'], { kind: 'autoclaim', mode: 'off' });
variants(['auto claim', 'is auto claim on?', 'show autoclaim status'], { kind: 'autoclaim', mode: 'status' });
variants(['yes', 'do it', 'please confirm'], { kind: 'confirm' });
variants(['no', 'cancel', 'never mind'], { kind: 'cancel' });
variants(['hi', 'hello', 'hey oliver'], { kind: 'greet' });
variants(['thanks', 'thank you', 'cheers'], { kind: 'thanks' });
variants(['help', '', 'what can you do'], { kind: 'help' });
variants(['sandwich', '🫒', '???'], { kind: 'unknown' });
variants(['do not claim all', "don't stake 100 to tor", 'never move 100 from tor to khan'], { kind: 'unknown', reason: 'negated' });
variants(['what if I claim all?', 'suppose I stake 100 to tor', 'imagine unstaking everything'], { kind: 'unknown' });
variants(['swap eth for obn', 'buy 100 obn', 'sell 100 obn'], { kind: 'unknown', reason: 'swap' });
variants(['0x1234567890abcdef', 'send 100 to 0x123456', 'send 10 to jack.base.eth'], { kind: 'unknown', reason: 'transfer' });
add('x'.repeat(10000), { kind: 'unknown' });
variants(['stake 100 more to it', 'stake 100 to that one', 'stake 100 to the same one'], { kind: 'stake', pid: 6, amount: obn('100') }, { lastPid: 6 });
variants(['no, I meant Tor', 'Tor instead', 'actually Tor'], { kind: 'stake', pid: 6, amount: null }, { pending: 'stake' });
add('make it 500 instead', { kind: 'stake', pid: null, amount: obn('500') }, { pending: 'stake' });
for (const category of ['humanitarian', 'environment', 'animals']) {
  const pids = POOLS.filter(p => p.live && p.category === category).map(p => p.pid);
  variants([`which nonprofits are ${category}?`, `list ${category} nonprofits`, `show ${category} causes`], { kind: 'category', category, pid: null });
  add(`stake 1,000 to each ${category} nonprofit`, { kind: 'stakeEach', pids, split: false, amount: obn('1000') });
  add(`split 10k across ${category}`, { kind: 'stakeEach', pids, split: true, amount: obn('10000') });
  add(`unstake 100 from all ${category} nonprofits`, { kind: 'unstakeEach', pids, split: false, amount: obn('100') });
  add(`how much is staked in ${category}?`, stats('staked', pids));
  add(`stake 100 to the ${category} nonprofit with the least stake`, { kind: 'stake', pid: null, amount: obn('100'), pick: { order: 'least', by: 'staked', pids } });
}
variants(['what categories are there?', 'what kinds of nonprofits do you support?', 'list categories'], { kind: 'category', category: null, pid: null });
variants(['what category is Tor in?', 'which category is Tor?', 'Tor category'], { kind: 'category', category: null, pid: 6 });
for (const [topic, inputs] of [
  ['about', ['what is obn?', 'who are you', 'explain obn']],
  ['emissions', ['where does the yield come from?', 'where do rewards come from?', 'explain staking emissions']],
  ['recipients', ['what do nonprofits get?', 'what do stakers get?', 'how are rewards divided?']],
  ['selection', ['how are nonprofits chosen?', 'how are pools added?', 'can a nonprofit be removed?']],
  ['charityWallets', ['what is a charity wallet?', 'how does a nonprofit receive funds?', 'where do nonprofit rewards go?']],
  ['seed', ['what is the community seed pool?', 'explain the genesis reserve', 'how are nonprofits bootstrapped?']],
  ['charter', ['what is the charter?', 'who decides what?', 'explain the protocol constitution']],
  ['allocation', ['what is annual allocation?', 'how are protocol funds allocated?', 'what are protocol funds?']],
  ['terms', ['is this a donation receipt?', 'is this financial advice?', 'are contributions tax deductible?']],
  ['token', ['what is the token supply?', 'what is the OBN contract?', 'explain token basics']],
  ['campaigns', ['what are campaigns?', 'how do campaigns work?', 'tell me about campaigns']],
]) variants(inputs, { kind: 'faq', topic });
