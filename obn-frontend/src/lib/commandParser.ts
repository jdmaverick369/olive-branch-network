// Turns a typed request ("stake 10,000 OBN to St Jude", "unstake $5 from st jude",
// "turn on auto claim", "how many people stake with charity water?") into a structured
// intent. Pure and dependency-free so it can be tested with node. Nothing here touches a
// wallet: the page checks balances, shows a confirm card, and the user signs.

import type { FaqTopic } from "./oliverFaq";

export type CommandPool = { pid: number; name: string; live: boolean };

export type CommandAmount =
  | { unit: "obn"; value: string }     // decimal string, safe for parseUnits
  | { unit: "usd"; value: string }
  | { unit: "percent"; value: string } // of the wallet balance (stake) or the pool stake (unstake), 0-100
  | { unit: "all" };

export type StatsMetric = "overview" | "stakers" | "staked" | "contributed" | "price" | "pools";

export type Command =
  | { kind: "stake" | "unstake"; amount: CommandAmount | null; pid: number | null; pick?: PoolPick }
  | { kind: "claim"; pid: number | null; all?: true; pick?: PoolPick } // all: every pool with rewards
  | { kind: "move"; from: number | null; to: number | null; amount: CommandAmount | null }
  // Stake into several nonprofits at once. pids empty = every nonprofit. split: the amount is a total
  // shared evenly ("split 11M across all"); otherwise each nonprofit gets the amount ("1M to each").
  | { kind: "stakeEach"; amount: CommandAmount | null; pids: number[]; split: boolean }
  | { kind: "status"; pid: number | null }                         // the user's own positions
  | { kind: "autoclaim"; mode: "on" | "off" | "status" }
  | { kind: "stats"; metric: StatsMetric; pids: number[]; rank: "most" | "least" | null; limit: number | null; days: number | null }
  | { kind: "faq"; topic: FaqTopic }                                   // a question the FAQ answers
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "greet" }
  | { kind: "thanks" }
  | { kind: "help" }
  | { kind: "unknown"; reason?: "transfer" | "swap" | "multiple" | "negated" };

/** "the nonprofit with the least stake": which pool to pick once the page has the numbers. */
export type PoolPick = { order: "most" | "least"; by: "staked" | "stakers" | "contributed" | "mine" };

export type ParseContext = { pending?: "stake" | "unstake" | "claim" | "move" | "stakeEach" | null };

// ---------------------------------------------------------------------------------------
// Pools

// Short names people actually type, keyed by pid. Full names always match too.
const POOL_ALIASES: Record<number, string[]> = {
  0: ["givedirectly", "give directly"],
  1: ["heifer", "heifer intl"],
  2: ["last door", "lastdoor"],
  3: ["freedom of the press", "freedom of press", "freedom press", "freedom of the press foundation", "fpf"],
  4: ["khan", "khan academy", "khanacademy"],
  5: ["rainforest", "rainforest foundation", "rainforest us", "rfus"],
  6: ["tor", "tor project", "torproject", "the tor project"],
  7: ["st jude", "saint jude", "stjude", "st judes", "saint judes", "st jude childrens", "st jude childrens hospital"],
  8: ["charity water", "charitywater"],
  9: ["internet archive", "archiveorg", "archive org", "the internet archive", "archive"],
  10: ["k9", "k 9", "k9 rescue", "k 9 rescue", "k9 rescue international"],
};

// What a nonprofit does, for "stake 100 to the dog charity". Exact words only, and only
// consulted when no name matched.
const POOL_TOPICS: Record<number, string[]> = {
  0: ["cash transfers", "poverty", "cash aid"],
  1: ["farmers", "farming", "hunger", "livestock"],
  2: ["addiction", "recovery", "rehab"],
  3: ["journalism", "journalists", "free press", "press freedom"],
  4: ["education", "free education", "online learning"],
  5: ["rainforests", "forests", "climate", "indigenous"],
  6: ["privacy", "online privacy", "anonymity"],
  7: ["childhood cancer", "cancer", "childrens hospital", "kids hospital", "childrens research"],
  8: ["clean water", "water"],
  9: ["wayback machine", "wayback", "digital library"],
  10: ["dogs", "dog", "animals", "animal", "strays", "pets", "cats"],
};

// Words that are never part of a nonprofit's name, so typo matching skips them.
const COMMON = new Set(("a an the to from for in into on at of and or with my me i my our your all any some " +
  "stake staked staking stakes unstake withdraw deposit claim claims rewards reward obn usd dollars dollar bucks " +
  "please how many much people stakers is are was what whats which who has have had do does did can could would " +
  "total pool pools nonprofit nonprofits charity charities more most least top show tell give put take get it this that " +
  "auto off on back out half everything max today week month year days ago now").split(" "));

/** Edits needed to turn a into b; swapping two neighbouring letters ("stkae") counts as one. */
function editDistance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const spaced = (s: string) => ` ${s.replace(/\s+/g, " ").trim()} `;

/**
 * Every nonprofit mentioned, in order, plus the text with those mentions removed (so
 * "K9 Rescue" never becomes "9 OBN"). `ambiguous` lists the candidates when a typo
 * could be more than one nonprofit.
 */
function findPools(text: string, pools: CommandPool[]) {
  const live = pools.filter(p => p.live);
  const liveIds = new Set(live.map(p => p.pid));
  const hits: { pid: number; at: number; role: "from" | "to" | null }[] = [];
  let rest = text;
  const take = (pid: number, at: number, span: string) => {
    // "from Tor" is where funds leave; "to / into St Jude" is where they go.
    const before = text.slice(Math.max(0, at - 16), at);
    const role = /\b(?:from|out of|outta)\s+(?:the\s+)?$/.test(before) ? "from" : /\b(?:to|into|in|onto|towards?)\s+(?:the\s+)?$/.test(before) ? "to" : null;
    hits.push({ pid, at, role });
    rest = rest.slice(0, at) + " ".repeat(span.length) + rest.slice(at + span.length);
  };

  // "pool 7", "pool #7", "#7"
  for (const m of text.matchAll(/ (?:pool|pid)\s*#?\s*(\d{1,3})(?= )| #(\d{1,3})(?= )/g)) {
    const pid = Number(m[1] ?? m[2]);
    if (liveIds.has(pid)) take(pid, m.index!, m[0]);
  }

  const names = live.flatMap(p => [p.name, ...(POOL_ALIASES[p.pid] ?? [])].map(alias => ({ pid: p.pid, alias: normalizeName(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length); // longest first: "internet archive" before "archive"
  for (const n of names) {
    for (let at = rest.indexOf(` ${n.alias} `); at >= 0; at = rest.indexOf(` ${n.alias} `, at + 1)) take(n.pid, at + 1, n.alias);
  }

  if (hits.length === 0) {
    const topics = live.flatMap(p => (POOL_TOPICS[p.pid] ?? []).map(t => ({ pid: p.pid, alias: t })))
      .sort((a, b) => b.alias.length - a.alias.length);
    for (const t of topics) {
      const at = rest.indexOf(` ${t.alias} `);
      if (at >= 0) take(t.pid, at + 1, t.alias);
    }
  }

  let ambiguous: number[] = [];
  if (hits.length === 0) {
    // Typo fallback: compare every 1-4 word phrase against names of 5+ letters.
    const words = rest.trim().split(" ").filter(Boolean);
    let best: { d: number; pids: Set<number>; phrase: string } | null = null;
    for (let i = 0; i < words.length; i++) {
      for (let len = 1; len <= 4 && i + len <= words.length; len++) {
        const slice = words.slice(i, i + len);
        if (slice.some(w => COMMON.has(w) || /^\d/.test(w))) continue;
        const phrase = slice.join(" ");
        if (phrase.length < 4) continue;
        for (const n of names) {
          if (n.alias.length < 5 || n.alias[0] !== phrase[0]) continue;
          const d = editDistance(phrase, n.alias);
          if (d > (n.alias.length < 7 ? 1 : 2)) continue;
          if (!best || d < best.d) best = { d, pids: new Set([n.pid]), phrase };
          else if (d === best.d) best.pids.add(n.pid);
        }
      }
    }
    if (best?.pids.size === 1) take([...best.pids][0], rest.indexOf(` ${best.phrase} `) + 1, best.phrase);
    else if (best) ambiguous = [...best.pids];
  }

  hits.sort((a, b) => a.at - b.at);
  return { pids: [...new Set(hits.map(h => h.pid))], hits, rest: spaced(rest), ambiguous };
}

// ---------------------------------------------------------------------------------------
// Text clean-up

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000 };

/** "ten thousand" -> "10000", "a hundred" -> "100", "twenty five" -> "25". */
function wordsToNumbers(text: string) {
  const words = text.trim().split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length;) {
    const startsNumber = (w: string, next?: string) => w in SMALL || (w === "a" && !!next && next in SCALE);
    // A lone "one" ("the cancer one", "which one") is only an amount when a unit follows it.
    const loneOne = words[i] === "one" && !/^(?:hundred|thousand|million|billion|obn|tokens?|dollars?|bucks?|percent|k|m)$/.test(words[i + 1] ?? "");
    if (!startsNumber(words[i], words[i + 1]) || loneOne) {
      out.push(words[i++]);
      continue;
    }
    let total = 0;
    let current = 0;
    let j = i;
    for (; j < words.length; j++) {
      const w = words[j];
      if (w === "a" && j === i) { current = 1; continue; }
      if (w in SMALL) current += SMALL[w];
      else if (w === "hundred") current = (current || 1) * 100;
      else if (w in SCALE) { total += (current || 1) * SCALE[w]; current = 0; }
      else if (w === "and" && j > i && (words[j + 1] ?? "") in SMALL) continue;
      else break;
    }
    out.push(String(total + current));
    i = j;
  }
  return out.join(" ");
}

// Every word the parser listens for. Misspellings of these are corrected before parsing.
const KEYWORDS = ("stake stakes staked staking unstake unstaking withdraw deposit claim claims claiming collect harvest redeem " +
  "remove unlock reduce decrease lower increase support donate invest commit contribute fund delegate allocate cash exit " +
  "reward rewards earnings earned interest yield dollar dollars bucks cents percent half third quarter everything maximum " +
  "people persons stakers users wallets holders members supporters participants everyone " +
  "price worth value tvl locked contributed contributions donated donations raised received funded impact generated " +
  "autoclaim automatic automatically monthly enable enabled disable disabled activate deactivate turn switch " +
  "nonprofit nonprofits charity charities organizations causes compare leaderboard ranking ranked highest lowest " +
  "biggest largest smallest fewest least most popular today yesterday week month year days weeks months " +
  "help commands cancel confirm nevermind status balance balances portfolio position positions summary statistics stats analytics " +
  "transfer swap move send trade exchange bridge purchase from into with " +
  "apy yield fees safe secure security audit audited minimum governance vote voting mint minting blockchain network " +
  "lockup locked discord offering emissions schedule " +
  "thousand million billion hundred twenty thirty forty fifty sixty seventy eighty ninety eleven twelve fifteen").split(" ");
// Ordinary words that are close to a keyword but must never be "corrected" into one.
const PROTECTED = new Set(("oliver mind save mine more must some same want need like just also then than them they your yours been does done " +
  "that this what when where will would could should there their here about after again every only over such very well were " +
  "give take make made back long last next stop state steak stack stock steal claimed state form near sure much many what ever " +
  "money cost tell show list send look check help want hold mean meant plan plans test case note none nine line time").split(" "));
const vocabularies = new WeakMap<CommandPool[], string[]>();
function vocab(pools: CommandPool[]) {
  const cached = vocabularies.get(pools);
  if (cached) return cached;
  const poolWords = pools.flatMap(p => [p.name, ...(POOL_ALIASES[p.pid] ?? []), ...(POOL_TOPICS[p.pid] ?? [])])
    .flatMap(n => normalizeName(n).split(" "));
  const words = [...new Set([...KEYWORDS, ...poolWords])].filter(w => w.length >= 3 && !/\d/.test(w));
  vocabularies.set(pools, words);
  return words;
}

/** "stkae" -> "stake", "poeple" -> "people", "watr" -> "water". Unclear cases are left alone. */
function correctSpelling(text: string, pools: CommandPool[]) {
  const words = vocab(pools);
  const known = new Set([...words, ...COMMON, ...PROTECTED, ...Object.keys(SMALL), ...Object.keys(SCALE)]);
  return text.split(" ").map(word => {
    if (word.length < 4 || known.has(word) || /[^a-z]/.test(word)) return word;
    const limit = word.length >= 7 ? 2 : 1;
    let best: string[] = [];
    let bestDistance = limit + 1;
    for (const candidate of words) {
      if (Math.abs(candidate.length - word.length) > limit) continue;
      const d = editDistance(word, candidate);
      if (d > limit) continue; // too different to be a typo of this keyword
      if (d < bestDistance) { best = [candidate]; bestDistance = d; }
      else if (d === bestDistance) best.push(candidate);
    }
    // On a tie, prefer the same length ("stakd" -> "stake"); still tied means too unclear to guess.
    if (best.length > 1) best = best.filter(c => c.length === word.length);
    return best.length === 1 ? best[0] : word;
  }).join(" ");
}

function normalizeName(s: string) {
  return s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function normalize(input: string, pools: CommandPool[]) {
  let s = input.toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/\$obn\b/g, " obn ")                 // the ticker, not dollars
    .replace(/[^a-z0-9.$,%#\s-]/g, " ")
    .replace(/(?<=[a-z])\.|\.(?![0-9])/g, " ")    // "st." / sentence dots, keep decimals
    .replace(/(?<!\d),|,(?!\d{3}\b)/g, " ")      // keep thousands separators only
    .replace(/(?<=[a-z])-|-(?=[a-z])/g, " ")      // auto-claim, k-9
    .replace(/\s+/g, " ");
  s = wordsToNumbers(correctSpelling(s.trim(), pools))
    .replace(/\ba (?:dollar|buck)\b/g, "1 dollar")
    .replace(/\b(\d+(?:\.\d+)?) ?cents?\b/g, (_, n: string) => `$${(Number(n) / 100).toString()}`);
  return spaced(s);
}

const FILLER = /^ (?:@?oliver|@?banker ?bot|@?bankr ?bot|@?bankr|banker|bot|obn bot|hey|hi|hello|yo|ok|okay|so|um|uh|please|pls|plz|can you|could you|would you|will you|can u|could u|i want to|i wanna|i would like to|id like to|i need to|lets|let us|go ahead and|just|kindly)\b,? ?/;
function stripFiller(text: string) {
  let s = text;
  for (let previous = ""; previous !== s;) { previous = s; s = spaced(s.replace(FILLER, " ")); }
  return spaced(s.replace(/\b(?:please|pls|plz|for me|thanks|thank you|thx|asap|now)\b/g, " "));
}

// ---------------------------------------------------------------------------------------
// Amounts

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)`;

/** Multiply a decimal string by 10^places (places may be negative) without floating point. */
function shiftDecimal(value: string, places: number) {
  let [int, frac = ""] = value.split(".");
  if (places >= 0) { int += frac.padEnd(places, "0").slice(0, places); frac = frac.slice(places); }
  else { const p = -places; frac = int.padStart(p + 1, "0").slice(-p) + frac; int = int.padStart(p + 1, "0").slice(0, -p); }
  int = int.replace(/^0+(?=\d)/, "");
  frac = frac.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

const SUFFIX: Record<string, number> = { k: 3, thousand: 3, grand: 3, m: 6, mil: 6, million: 6, b: 9, billion: 9 };

/** The amount tied to "each" ("1M more OBN to each", "$5 each"), even when the message has other numbers in it. */
function eachAmount(text: string): CommandAmount | null {
  const m = text.match(new RegExp(`((?:\\$\\s*)?${NUM}\\s*(?:k|m|b|thousand|million|billion|mil)?\\b\\s*(?:more\\s+)?(?:obn|tokens?|dollars?|bucks?|usd)?\\s*(?:more\\s+)?)(?:to|into|in|for|with)?\\s*(?:each|every|apiece|per\\s+(?:nonprofit|charity|pool|org))\\b`));
  return m ? findAmount(spaced(m[1])) : null;
}

/** The single amount in the text, or null. Two different amounts ("100 or 200") also give null. */
function findAmount(text: string): CommandAmount | null {
  const found: CommandAmount[] = [];
  let rest = text;
  if (/\b(?:all|everything|max|maximum|entire|whole|full amount|all of it|every last)\b|\b(?:the most|as much as) (?:i|we) (?:can|have|got)\b/.test(rest)) found.push({ unit: "all" });
  if (/\bhalf\b/.test(rest)) found.push({ unit: "percent", value: "50" });
  if (/\b(?:a )?third\b/.test(rest)) found.push({ unit: "percent", value: "33.33" });
  if (/\b(?:a )?quarter\b/.test(rest)) found.push({ unit: "percent", value: "25" });
  // Percentages first so "10%" can never be read as 10 OBN.
  rest = rest.replace(new RegExp(`${NUM}\\s*(?:%|percent\\b|pct\\b)`, "g"), (_, n: string) => {
    const v = n.replace(/,/g, "");
    found.push(Number(v) > 0 && Number(v) <= 100 ? { unit: "percent", value: shiftDecimal(v, 0) } : { unit: "percent", value: "invalid" });
    return " ";
  });
  const money = new RegExp(`(\\$\\s*|\\busd\\s+)?${NUM}\\s*(k|m|b|thousand|million|billion|mil|grand)?\\b\\s*(\\$|usd\\b|dollars?\\b|bucks?\\b|obn\\b|tokens?\\b)?`, "g");
  for (const m of rest.matchAll(money)) {
    let value = m[2].replace(/,/g, "");
    if (value.startsWith(".")) value = `0${value}`;
    value = shiftDecimal(value, SUFFIX[m[3] ?? ""] ?? 0);
    const usd = !!m[1] || (!!m[4] && !/^(?:obn|tokens?)$/.test(m[4])) || m[3] === "grand";
    found.push({ unit: usd ? "usd" : "obn", value });
  }
  const valid = found.filter(a => a.unit === "all" || (/^\d+(?:\.\d+)?$/.test(a.value) && Number(a.value) > 0));
  const distinct = new Map(valid.map(a => [a.unit === "all" ? "all" : `${a.unit}:${a.value}`, a]));
  if (distinct.size !== 1 || valid.length !== found.length) return null;
  return [...distinct.values()][0];
}

// ---------------------------------------------------------------------------------------
// Intents

const has = (re: RegExp, s: string) => re.test(s);

const REWARD_WORDS = /\b(?:rewards?|earnings?|yield|interest|profits?|gains?|returns?|what ive earned|what i earned)\b/;
const CLAIM_VERBS = /\b(?:claim|collect|harvest|redeem)\b/;
const UNSTAKE_VERBS = /\b(?:unstake|withdraw|remove|unlock|pull|take out|take back|cash out|exit|leave|reduce|decrease|lower|get (?:\w+ ){0,4}back|take (?:\w+ ){0,3}out|pull (?:\w+ ){0,3}out)\b/;
const STAKE_VERBS = /\b(?:stake|deposit|put|add|give|support|back|lock|fund|donate|delegate|invest|commit|contribute|increase|top up|allocate|split|spread|divide|distribute)\b/;
const NEGATION = /\b(?:dont|do not|never|not|no longer|stop)\b/;

function autoclaimMode(text: string): "on" | "off" | "status" {
  const off = has(/\b(?:off|disable|disabled|deactivate|stop|cancel|pause|turn off|switch off|no longer|dont|do not|remove)\b/, text);
  const on = has(/\b(?:on|enable|enabled|activate|start|turn on|switch on|set up|setup|sign me up|opt in|yes|want|automatically|every month)\b/, text);
  const question = has(/^ (?:is|are|do|does|did|whats|what|hows|how|check|show|status)\b/, text) || has(/\bstatus\b/, text);
  if (question && !has(/^ (?:can|could|would) /, text)) return "status";
  if (off && !on) return "off";
  if (on && !off) return "on";
  return off ? "off" : "status";
}

function statsPeriod(text: string): number | null {
  const n = text.match(/\b(?:last|past|previous) (\d+) (days?|weeks?|months?|years?)\b/);
  if (n) return Number(n[1]) * ({ d: 1, w: 7, m: 30, y: 365 } as Record<string, number>)[n[2][0]];
  if (has(/\b(?:today|24 hours|yesterday|last day|past day)\b/, text)) return 1;
  if (has(/\b(?:this|last|past) week\b|\bweekly\b/, text)) return 7;
  if (has(/\b(?:this|last|past) month\b|\bmonthly\b/, text)) return 30;
  if (has(/\b(?:this|last|past) year\b|\b12 months\b|\byearly\b/, text)) return 365;
  return null;
}

function statsCommand(text: string, pids: number[]): Command {
  const rankLeast = has(/\b(?:least|lowest|fewest|smallest|bottom|worst)\b/, text);
  const rankMost = has(/\b(?:most|top|highest|biggest|largest|leading|best|rank|ranking|ranked|leaderboard|leaders|popular)\b/, text)
    || (has(/\b(?:which|what) (?:pool|nonprofit|charity|org|organization|cause)\b/, text) && !has(/\bwhich (?:pools|nonprofits|charities)\b/, text));
  const limit = Number(text.match(/\b(?:top|bottom) (\d{1,2})\b/)?.[1]) || null;
  let metric: StatsMetric = "overview";
  if (has(/\b(?:price|worth|cost|value of obn|obn value|trading at|how much is (?:an? |1 )?obn)\b/, text) && !has(/\b(?:staked|contributed)\b/, text)) metric = "price";
  else if (has(/\b(?:people|persons|stakers|users|wallets|holders|members|supporters|addresses|accounts|participants|folks|everyone|who)\b|how many (?:are |is )?(?:stak|support|us)/, text)) metric = "stakers";
  else if (has(/\b(?:contribut\w*|donat\w*|raised|received|receive|given|gave|paid|funded|impact|generated|sent|earned)\b/, text)) metric = "contributed";
  else if (has(/\b(?:staked|stake|stakes|staking|tvl|locked|deposited|deposits|total value|liquidity)\b/, text)) metric = "staked";
  else if (has(/\b(?:nonprofits|charities|pools|orgs|organizations|causes|options)\b/, text)) metric = "pools";
  const rank = metric === "pools" || metric === "price" ? null : rankLeast ? "least" : rankMost && pids.length === 0 ? "most" : null;
  return { kind: "stats", metric, pids, rank, limit, days: statsPeriod(text) };
}

// Which FAQ entry a question is about. Most specific first; the first match wins.
const FAQ_PATTERNS: [FaqTopic, RegExp][] = [
  ["autoclaimHow", /\bhow (?:do|can|would) (?:i|you|we) (?:turn|switch|enable|disable|set up|setup|start|stop|activate|cancel)(?: (?:on|off))? (?:the )?(?:monthly )?auto ?claim/],
  ["autoclaimWhen", /\bwhen (?:does|is|will|do) (?:the )?(?:monthly )?auto ?claim|\bauto ?claim (?:\w+ )?(?:schedule|date|day|run)\b|\b(?:claim|claiming) manually\b|\bmanual(?:ly)? claim/],
  ["autoclaimWhat", /\b(?:what is|whats|what does|explain|how does|tell me about) (?:the )?(?:sponsored )?(?:monthly )?auto ?claim\w*|\bauto ?claim\w* (?:do|mean|work|works)\b/],
  ["governance", /\b(?:governance|voting|vote|votes|extendolivebranch|extend olive branch|the ?offering|burned|burn)\b/],
  ["nft", /\b(?:nfts?|olivenfts?|olive nfts?|mint|minting|opensea)\b/],
  ["apy", /\b(?:apy|apr|yield|interest rate|rate of return|emissions?|reward rate|rewards? split|how (?:is|are) (?:the )?rewards? split)\b|\bhow much (?:will|would|can|could|do|does) (?:i|you|we|someone|people) (?:earn|make|get)\b|\bwhat (?:are|is) the returns?\b/],
  ["minimum", /\b(?:minimum|min (?:amount|stake|deposit)|smallest amount|how little|least (?:i|you) can (?:stake|deposit))\b/],
  ["unstakeAnytime", /\b(?:lock ?ups?|locked up|lock period|locking period|any ?time|whenever i want|how long (?:do|does|will|must|is) (?:i|my|it|the))\b/],
  ["rewards", /\b(?:when|how|how often) (?:do|will|can|would) (?:i|we|you) (?:get|receive|collect|be paid|earn)\b(?! (?:obn|tokens?)$)|\bhow do (?:the )?rewards work\b|\bwhen (?:are|do) (?:the )?rewards\b|\bhow (?:do|does) (?:i|you) get paid\b/],
  ["multiplePools", /\b(?:multiple|more than one|several|different|two|2|many) (?:pools|nonprofits|charities|causes)\b(?=.*\b(?:can|stake|staking|support)\b)|\bcan i stake (?:in|with|to|into) (?:multiple|more|several|two|2|many)\b/],
  ["fees", /\b(?:fees?|gas|commission)\b|\bcost (?:to|of) (?:stake|staking|use|using|unstake|unstaking|claim)|\b(?:does|will) (?:it|staking|this|unstaking|claiming) cost\b|\bneed eth\b/],
  ["safety", /\b(?:safe|safety|secure|security|audit|audited|risk|risky|scam|rug|rugpull|trustworthy|hacked|hack|legit)\b/],
  ["chain", /\b(?:blockchain|which chain|what chain|which network|what network|layer 2|l2|ethereum)\b|\b(?:is|are) (?:it|this|obn|you) on base\b|\bwhat (?:chain|network) is\b/],
  ["buy", /\b(?:where|how) (?:can|do|could|should) i (?:buy|get|purchase|acquire) (?:some |more )?obn\b|\bwhere (?:to|can i) buy\b|\bhow to (?:buy|get) obn\b/],
  ["howToStake", /\bhow (?:do|can|should|would) (?:i|you|we) (?:start |begin |get started )?(?:stake|staking|deposit|get started|start|begin|use (?:this|it|oliver))\b|\bhow (?:to|does) stak(?:e|ing)\b|\bget(?:ting)? started\b|\bwhat is staking\b|\bhow does staking work\b/],
  ["contact", /\b(?:discord|telegram|contact|support team|customer support|a human|real person|talk to (?:someone|a person|the team)|more questions|other questions|ask the team)\b/],
  ["about", /^ (?:what (?:is|are) (?:the )?(?:olive branch(?: network)?|obn|this(?: app| site| platform| protocol| thing)?)|whats (?:olive branch(?: network)?|obn|this)|who are you|who made (?:this|you)|tell me about (?:obn|olive branch|this)|explain (?:obn|olive branch|this)|how does (?:this|it|obn|olive branch)(?: network)? work) $/],
];

/** The FAQ topic a question is about, or null. Commands with an amount never count as questions. */
function faqTopic(text: string): FaqTopic | null {
  for (const [topic, pattern] of FAQ_PATTERNS) if (pattern.test(text)) return topic;
  return null;
}

// "least/most" plus up to five words after it ("the least amount of stake", "most stakers").
const RANK_PHRASE = /\b(?:the )?(?:least|fewest|lowest|smallest|most|highest|biggest|largest|top|leading|greatest)\b(?: \w+){0,5}|\b(?:needs?|need) (?:it|help|support|funding)? ?(?:the )?most\b|\bmost in need\b/;

/** Which ranking a pool reference uses, if the message picks a pool that way. */
function poolPick(text: string): PoolPick | null {
  const needy = /\bneeds? (?:it|help|support|funding)? ?(?:the )?most\b|\bmost in need\b|\bleast (?:supported|funded|popular|loved)\b/.test(text);
  const least = needy || /\b(?:least|fewest|lowest|smallest)\b/.test(text);
  const most = !least && /\b(?:most|highest|biggest|largest|top|leading|greatest)\b/.test(text);
  if (!least && !most) return null;
  // Only a pool reference ("the pool / nonprofit / one with ..."), never "stake the most I can".
  if (!/\b(?:pool|pools|nonprofit|nonprofits|charity|charities|organization|organizations|org|orgs|cause|causes|one|ones|position|positions|stake|staked|stakers|people|popular|supported|funded|contributions?|needs?|need)\b/.test(text)) return null;
  const order = least ? "least" : "most";
  if (/\b(?:my|mine|i have|ive|i hold|i am|im)\b/.test(text) && !/\bpeople|stakers\b/.test(text)) return { order, by: "mine" };
  if (/\b(?:stakers|people|supporters|members|users|wallets|popular|loved)\b/.test(text)) return { order, by: "stakers" };
  if (/\b(?:contribut\w*|donat\w*|raised|received|funded|funding)\b/.test(text) && !needy) return { order, by: "contributed" };
  return { order, by: "staked" };
}

export function parseCommand(input: string, pools: CommandPool[], context: ParseContext = {}): Command {
  const asked = input.trim().endsWith("?");
  const raw = normalize(input, pools).trim();
  const text = stripFiller(normalize(input, pools));
  const t = text.trim();

  // Short replies are judged before filler words ("ok", "hi", "please") are stripped.
  // "hi oliver", "thanks oliver": his name doesn't change the meaning.
  for (const s of [raw, t].map(v => v.replace(/[ ,]*\boliver$/, "").trim())) {
    if (/^(?:yes|yep|yeah|yup|y|ok|okay|confirm|confirmed|do it|ok do it|go|go for it|sure|proceed|approve|send it|lets go|lets do it|correct)$/.test(s)) return { kind: "confirm" };
    if (/^(?:no|nope|nah|n|cancel|stop|abort|never ?mind|nvm|forget it|forget that|wait|hold on|dont|undo)$/.test(s) || /^(?:never ?mind|nvm|cancel that|forget (?:it|that))\b/.test(s)) return { kind: "cancel" };
    if (/^(?:hi|hello|hey|hey there|yo|gm|good (?:morning|afternoon|evening)|sup|whats up|howdy|hiya)$/.test(s)) return { kind: "greet" };
    if (/^(?:thanks|thank you|thank you so much|thanks a lot|thx|ty|cheers|great|awesome|nice|cool|perfect|got it)$/.test(s)) return { kind: "thanks" };
  }
  if (!t) return { kind: "help" };
  if (/^(?:help|commands|menu|options|what can you do|what do you do|how does this work|how do you work|what can i (?:do|say|ask))$/.test(t)) return { kind: "help" };

  // FAQ questions. Anything with an amount is a command, never a question.
  // A question word up front ("what are the fees to stake 100?") still makes it a question.
  const topic = faqTopic(text);
  const opensAsQuestion = /^ (?:what|whats|which|who|how|hows|why|when|where|is|are|does|do|will|would|should) /.test(text) && !/^ (?:can|could) (?:i|you) /.test(text);
  if (topic && (opensAsQuestion || !findAmount(findPools(text, pools).rest))) return { kind: "faq", topic };

  // Auto-claim before anything else: "stop auto claim" is not a cancel.
  if (has(/\bauto ?(?:claim\w*|collect\w*|compound\w*)\b|\bautomatic(?:ally)? (?:claim\w*|collect\w*)\b|\b(?:monthly|recurring) (?:claim\w*|collection)\b|\bclaim (?:\w+ ){0,3}(?:automatically|every month|monthly)\b/, text)) {
    return { kind: "autoclaim", mode: autoclaimMode(text) };
  }

  const { pids, hits, rest, ambiguous } = findPools(text, pools);
  const pid = pids[0] ?? null;

  // Things this page will not do, with a specific reason so the reply can point somewhere useful.
  if (has(/\b0x[0-9a-f]{4,}|\b[a-z0-9-]+\.(?:base\.)?eth\b/, input.toLowerCase()) || (has(/\b(?:send|tip|pay|airdrop|gift)\b/, text) && !asked)) {
    return { kind: "unknown", reason: "transfer" };
  }
  // Moving a stake from one nonprofit to another (an unstake, then a stake).
  const moveVerb = has(/\b(?:move|switch|shift|transfer|migrate|reallocate|rebalance|swap (?:my )?(?:stake|position))\b/, rest);
  const twoWay = pids.length > 1 && has(/\bfrom\b.*\b(?:to|into)\b|\b(?:to|into)\b.*\bfrom\b/, text);
  if ((moveVerb && pids.length > 0) || twoWay) {
    const from = hits.find(h => h.role === "from")?.pid ?? hits.find(h => h.role !== "to")?.pid ?? null;
    const to = hits.find(h => h.role === "to" && h.pid !== from)?.pid ?? hits.find(h => h.pid !== from)?.pid ?? null;
    return { kind: "move", from, to, amount: findAmount(rest) };
  }
  // "move some of my stake" names no nonprofit yet; the page asks which. Otherwise "move 100 OBN" is a transfer.
  if (moveVerb && has(/\b(?:stakes?|staked|staking|position|positions|deposits?)\b/, text)) return { kind: "move", from: null, to: null, amount: findAmount(rest) };
  if (moveVerb) return { kind: "unknown", reason: "transfer" };
  if (has(/\b(?:swap|buy|sell|trade|bridge|exchange|convert|purchase)\b/, rest)) return { kind: "unknown", reason: "swap" };

  // "the organization with the least amount of stake": a pool chosen by ranking, not by name.
  const pick = pids.length === 0 ? poolPick(rest) : null;
  const ranked = pick ? spaced(rest.replace(RANK_PHRASE, " ")) : rest;
  // "my stake" is a noun, not a verb.
  const verbs = spaced(ranked.replace(/\b(?:my|your|our|the|whole|entire|current|existing) (?:stakes?|staking|position|deposit)\b/g, " position "));
  const rewards = has(REWARD_WORDS, verbs);
  const claimVerb = has(CLAIM_VERBS, verbs) || (rewards && has(/\b(?:get|take|withdraw|grab|pull|cash|receive)\b/, verbs));
  const unstakeVerb = !claimVerb && has(UNSTAKE_VERBS, verbs);
  const stakeVerb = has(STAKE_VERBS, verbs.replace(UNSTAKE_VERBS, " "));
  const actions = [claimVerb, unstakeVerb, stakeVerb].filter(Boolean).length;

  // Questions: about the user (status), how-to (help), or about everyone (stats).
  const question = (asked && actions === 0) || has(/^ (?:what|whats|which|who|whos|how|hows|where|when|is|are|was|were|does|did|has|have|show|list|tell|display|check|view|see|give me|compare|any|total|stats?|statistics|analytics|leaderboard|ranking|number of|count)\b/, text);
  const askIfAllowed = has(/^ (?:can|could|may|should|shall) i\b/, text) && actions > 0;
  if ((question && !askIfAllowed) || (!actions && has(/\b(?:stats?|statistics|analytics|tvl|leaderboard|ranking|price|balances?|portfolio|positions?|summary|earnings|earned|top \d+|most|least)\b/, text))) {
    if (has(/^ how (?:do|can|should|would) (?:i|you|we)\b(?! much)|^ (?:what is|whats|what are) (?:staking|unstaking|obn(?= $)|this|auto ?claim\w*|a pool|the point)\b|^ how does (?:it|this|staking) work/, text)) return { kind: "help" };
    const personal = has(/\b(?:i|im|ive|id|my|mine|myself)\b|(?<!\b(?:show|tell|give|let) )\bme\b/, text) && !has(/\b(?:people|stakers|everyone|total|overall|community|protocol|others|users|wallets)\b/, text);
    if (personal) return { kind: "status", pid };
    return statsCommand(text, pids);
  }
  if (!actions && has(/^ (?:my )?(?:balances?|portfolio|positions?|stakes|rewards|earnings|holdings|wallet)$/, text)) return { kind: "status", pid };

  if (actions > 1) return { kind: "unknown", reason: "multiple" };
  if (actions === 1 && has(NEGATION, verbs)) return { kind: "unknown", reason: "negated" };
  // Several nonprofits at once: "1M to each nonprofit", "split 11M across all of them", "100 each to Tor and Khan".
  if (actions === 1 && stakeVerb) {
    const allPools = /\b(?:each|every|all)\s+(?:of\s+)?(?:the\s+|my\s+|these\s+|those\s+)?(?:\d+\s+)?(?:nonprofits?|charities|charity|pools?|orgs?|organizations?|causes?|ones|them)\b|\bacross\s+(?:all|every|the board)\b|\b(?:to|into|in|for)\s+each\b/;
    const together = /\b(?:each|evenly|split|spread|divide|divided|between|among|across)\b/;
    if ((pids.length === 0 && has(allPools, verbs)) || (pids.length > 1 && has(together, verbs))) {
      const split = has(/\b(?:split|spread|divide|divided|evenly|between|among|total|across)\b/, verbs) && !has(/\beach\b/, verbs);
      // Drop the "all the nonprofits" phrase so its "all" isn't read as "stake all my OBN".
      const amountText = spaced(rest.replace(new RegExp(allPools.source, "g"), " ").replace(/\b(?:each|every)\b/g, " "));
      return { kind: "stakeEach", amount: eachAmount(rest) ?? findAmount(amountText), pids: pids.length > 1 ? pids : [], split };
    }
  }
  if (actions === 1 && pids.length > 1) return { kind: "unknown", reason: "multiple" };

  if (!actions && context.pending === "stakeEach") return { kind: "stakeEach", amount: findAmount(rest), pids: pids.length > 1 ? pids : [], split: false };
  const pending = context.pending === "stakeEach" ? null : context.pending ?? null; // stakeEach replies return above
  const kind = claimVerb ? "claim" : unstakeVerb ? "unstake" : stakeVerb ? "stake" : pending;
  if (!kind) {
    // A bare nonprofit name is a request to hear about it.
    if (pids.length > 0 && !findAmount(rest)) return statsCommand(text, pids);
    return { kind: "unknown" };
  }
  if (!actions && pids.length === 0 && !findAmount(rest) && ambiguous.length === 0) return { kind: "unknown" };
  if (kind === "move") {
    const role = hits[0]?.role;
    return { kind, from: role === "to" ? null : pid, to: role === "to" ? pid : null, amount: findAmount(rest) };
  }
  if (kind === "claim") {
    if (pid === null && pick) return { kind, pid, pick };
    return pid === null && has(/\b(?:all|every|everything|each)\b/, rest) ? { kind, pid, all: true } : { kind, pid };
  }
  const amount = findAmount(pick ? ranked : rest);
  return pick ? { kind, pid, amount, pick } : { kind, pid, amount };
}

/** Pools a typo could refer to, for "did you mean…" replies. */
export function ambiguousPools(input: string, pools: CommandPool[]) {
  return findPools(stripFiller(normalize(input, pools)), pools).ambiguous;
}
