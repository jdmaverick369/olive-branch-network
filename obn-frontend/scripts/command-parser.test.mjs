import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand, ambiguousPools } from "../src/lib/commandParser.ts";
import { POOLS } from "../src/lib/pools.ts";

const parse = (text, context) => parseCommand(text, POOLS, context);
const action = (kind, pid, amount) => ({ kind, pid, amount });
const obn = value => ({ unit: "obn", value });
const usd = value => ({ unit: "usd", value });
const pct = value => ({ unit: "percent", value });
const ALL = { unit: "all" };
const stats = (metric, pids = [], extra = {}) => ({ kind: "stats", metric, pids, rank: null, limit: null, days: null, ...extra });

const cases = (table) => { for (const [text, expected] of table) assert.deepEqual(parse(text), expected, text); };

test("stake: OBN amounts in any form", () => cases([
  ["bankerbot stake 10,000 OBN to St Jude", action("stake", 7, obn("10000"))],
  ["hey oliver, stake 10,000 OBN to St Jude", action("stake", 7, obn("10000"))],
  ["@bankrbot stake 2.5k obn in charity: water", action("stake", 8, obn("2500"))],
  ["stake ten thousand obn in st jude", action("stake", 7, obn("10000"))],
  ["stake a hundred to tor", action("stake", 6, obn("100"))],
  ["stake twenty one obn to tor", action("stake", 6, obn("21"))],
  ["deposit 1 million obn to pool 7", action("stake", 7, obn("1000000"))],
  ["stake 1.5m to Give Directly", action("stake", 0, obn("1500000"))],
  ["stake 100 $OBN to khan", action("stake", 4, obn("100"))],
  ["deposit 0.75 to Khan", action("stake", 4, obn("0.75"))],
  ["stake 25 to #3", action("stake", 3, obn("25"))],
]));

test("stake: dollar amounts", () => cases([
  ["put five dollars into charity water", action("stake", 8, usd("5"))],
  ["stake $100 worth of obn to khan", action("stake", 4, usd("100"))],
  ["stake 50 cents to tor", action("stake", 6, usd("0.5"))],
  ["withdraw 20 dollars from tor", action("unstake", 6, usd("20"))],
  ["unstake $5 from  St Jude", action("unstake", 7, usd("5"))],
]));

test("stake: many verbs, polite wrappers and nicknames", () => cases([
  ["hey bankr can you please stake 2.5k into the dog charity", action("stake", 10, obn("2500"))],
  ["top up tor with 500", action("stake", 6, obn("500"))],
  ["increase my stake in tor by 100", action("stake", 6, obn("100"))],
  ["put 1k in k-9 rescue", action("stake", 10, obn("1000"))],
  ["give 100 to give directly", action("stake", 0, obn("100"))],
  ["donate 50 to freedom of the press", action("stake", 3, obn("50"))],
  ["stake 10 to the cancer one", action("stake", 7, obn("10"))],
  ["stake 100 to tor?", action("stake", 6, obn("100"))],
  ["can i stake 100 into tor", action("stake", 6, obn("100"))],
  ["stake all my OBN to heifer", action("stake", 1, ALL)],
]));

test("unstake and claim", () => cases([
  ["reduce my stake in heifer by 20%", action("unstake", 1, pct("20"))],
  ["withdraw half of my stake from st jude", action("unstake", 7, pct("50"))],
  ["get my obn back from khan", action("unstake", 4, null)],
  ["take 300 out of the internet archive", action("unstake", 9, obn("300"))],
  ["cash out everything from tor", action("unstake", 6, ALL)],
  ["unstake everything from St. Jude's", action("unstake", 7, ALL)],
  ["unstake 5.5k obn from st. jude's", action("unstake", 7, obn("5500"))],
  ["unstake all", action("unstake", null, ALL)],
  ["withdraw my rewards from st jude", { kind: "claim", pid: 7 }],
  ["claim all my rewards", { kind: "claim", pid: null, all: true }],
  ["claim everything", { kind: "claim", pid: null, all: true }],
  ["collect from charity water", { kind: "claim", pid: 8 }],
]));

test("auto-claim on, off and status", () => cases([
  ["turn on auto claim", { kind: "autoclaim", mode: "on" }],
  ["enable auto-claim", { kind: "autoclaim", mode: "on" }],
  ["i want auto claim", { kind: "autoclaim", mode: "on" }],
  ["claim my rewards automatically every month", { kind: "autoclaim", mode: "on" }],
  ["turn off autoclaim", { kind: "autoclaim", mode: "off" }],
  ["stop auto claiming", { kind: "autoclaim", mode: "off" }],
  ["is auto claim on?", { kind: "autoclaim", mode: "status" }],
  ["auto claim", { kind: "autoclaim", mode: "status" }],
]));

test("analytics questions", () => cases([
  ["how many people are staking in st jude", stats("stakers", [7])],
  ["how many stakers does tor have", stats("stakers", [6])],
  ["how many people stake with obn", stats("stakers")],
  ["how many new stakers this week", stats("stakers", [], { days: 7 })],
  ["how much is staked in charity water", stats("staked", [8])],
  ["whats the tvl", stats("staked")],
  ["how much has st jude received", stats("contributed", [7])],
  ["how much have we raised", stats("contributed")],
  ["how much was contributed this month", stats("contributed", [], { days: 30 })],
  ["which nonprofit has the most stakers", stats("stakers", [], { rank: "most" })],
  ["top 3 pools by contributions", stats("contributed", [], { rank: "most", limit: 3 })],
  ["which pool has the least staked", stats("staked", [], { rank: "least" })],
  ["compare tor and st jude", stats("overview", [6, 7])],
  ["how is st jude doing", stats("overview", [7])],
  ["St Jude", stats("overview", [7])],
  ["stats", stats("overview")],
  ["whats the price of obn", stats("price")],
  ["how much is obn worth", stats("price")],
  ["how many nonprofits are there", stats("pools")],
  ["list the charities", stats("pools")],
]));

test("questions about the user's own positions", () => cases([
  ["what am I staking?", { kind: "status", pid: null }],
  ["how much have I earned", { kind: "status", pid: null }],
  ["how much have I earned for St Jude", { kind: "status", pid: 7 }],
  ["what have i contributed to st jude", { kind: "status", pid: 7 }],
  ["my balance", { kind: "status", pid: null }],
  ["how much is my obn worth", { kind: "status", pid: null }],
]));

test("refuses transfers, swaps, moves, several actions and negated requests", () => cases([
  ["send 500 OBN to 0xabc123", { kind: "unknown", reason: "transfer" }],
  ["send 100 to jack.base.eth", { kind: "unknown", reason: "transfer" }],
  ["buy obn", { kind: "unknown", reason: "swap" }],
  ["swap eth for obn", { kind: "unknown", reason: "swap" }],
  ["stake 100 to tor and st jude", { kind: "unknown", reason: "multiple" }],
  ["dont stake to tor", { kind: "unknown", reason: "negated" }],
  ["make me a sandwich", { kind: "unknown" }],
]));

test("unclear amounts are left for the page to ask about", () => cases([
  ["stake 100 or 200 to tor", action("stake", 6, null)],
  ["stake 150% to tor", action("stake", 6, null)],
  ["stake 1/2 to tor", action("stake", 6, null)],
  ["stake 10,000 OBN ($0.20) to st jude", action("stake", 7, null)],
  ["stake 100", action("stake", null, obn("100"))],
  ["stake to k9", action("stake", 10, null)],
]));

test("typos still find the nonprofit; real ambiguity is reported", () => {
  assert.equal(parse("stake 50 to st jdue").pid, 7);
  assert.equal(parse("stake 50 to rainforrest foundation").pid, 5);
  assert.equal(parse("stake 5 to internet archive").pid, 9);
  assert.equal(parse("stake 5 to freedom of the press").pid, 3);
  assert.deepEqual(ambiguousPools("stake 5 to st jude", POOLS), []);
});

test("misspelled commands are still understood", () => cases([
  ["stkae 100 to tor", action("stake", 6, obn("100"))],
  ["staek all to k9", action("stake", 10, ALL)],
  ["unstak 50 from charity watr", action("unstake", 8, obn("50"))],
  ["withdrawl 10 from khan", action("unstake", 4, obn("10"))],
  ["deposite 5 dollers to khan", action("stake", 4, usd("5"))],
  ["stake ten thousnd to tor", action("stake", 6, obn("10000"))],
  ["stake 100 to st juud", action("stake", 7, obn("100"))],
  ["stake 100 to internet archvie", action("stake", 9, obn("100"))],
  ["clam my rewards", { kind: "claim", pid: null }],
  ["colect from tor", { kind: "claim", pid: 6 }],
  ["turn on autoclam", { kind: "autoclaim", mode: "on" }],
  ["turn on auto calim", { kind: "autoclaim", mode: "on" }],
  ["how many poeple stake in st jude", stats("stakers", [7])],
  ["how many stakrs does charity water have", stats("stakers", [8])],
  ["how much is stakd in tor", stats("staked", [6])],
  ["whats the prise of obn", stats("price")],
  ["show me the leaderbord", stats("overview", [], { rank: "most" })],
]));

test("spelling correction never turns ordinary words into commands or amounts", () => cases([
  ["put five dollars into charity water", action("stake", 8, usd("5"))],
  ["stake fiv dollars to tor", action("stake", 6, null)],
  ["i must stake 100 to tor", action("stake", 6, obn("100"))],
  ["show me my stakes", { kind: "status", pid: null }],
  ["make me a sandwich", { kind: "unknown" }],
]));

const move = (from, to, amount) => ({ kind: "move", from, to, amount });
test("moves between nonprofits know which end is which", () => cases([
  ["move 100 from tor to st jude", move(6, 7, obn("100"))],
  ["move everything to st jude from heifer", move(1, 7, ALL)],
  ["switch my stake from tor to khan", move(6, 4, null)],
  ["unstake from tor and stake into heifer", move(6, 1, null)],
  ["move half of my tor stake to charity water", move(6, 8, pct("50"))],
  ["move $5 from st jude to tor", move(7, 6, usd("5"))],
  ["move 100 to st jude", move(null, 7, obn("100"))],
  ["move my stake out of tor", move(6, null, null)],
  ["move 100 obn", { kind: "unknown", reason: "transfer" }],
  ["move some of my stake", move(null, null, null)],
  ["switch half my stake", move(null, null, pct("50"))],
]));

test("follow-up answers fill in a pending move", () => {
  assert.deepEqual(parse("St Jude", { pending: "move" }), move(7, null, null));
  assert.deepEqual(parse("to St Jude", { pending: "move" }), move(null, 7, null));
  assert.deepEqual(parse("50%", { pending: "move" }), move(null, null, pct("50")));
  assert.deepEqual(parse("all of them", { pending: "claim" }), { kind: "claim", pid: null, all: true });
});

const picked = (kind, amount, order, by) => kind === "claim" ? { kind, pid: null, pick: { order, by } } : { kind, pid: null, amount, pick: { order, by } };
test("pools picked by ranking instead of by name", () => cases([
  ["can we stake 10,000 OBN to the organization with the least amount of stake?", picked("stake", obn("10000"), "least", "staked")],
  ["stake all to the least staked pool", picked("stake", ALL, "least", "staked")],
  ["stake 100 to the charity that needs it most", picked("stake", obn("100"), "least", "staked")],
  ["stake 500 to the most popular nonprofit", picked("stake", obn("500"), "most", "stakers")],
  ["stake 1k to the one with the fewest stakers", picked("stake", obn("1000"), "least", "stakers")],
  ["stake $5 to the nonprofit with the least contributions", picked("stake", usd("5"), "least", "contributed")],
  ["unstake 100 from the pool with the most stake", picked("unstake", obn("100"), "most", "staked")],
  ["unstake half from my biggest position", picked("unstake", pct("50"), "most", "mine")],
  ["claim from the pool with the most rewards", picked("claim", null, "most", "staked")],
  // Ranking words that are not picking a pool
  ["stake the most i can to tor", action("stake", 6, ALL)],
  ["which pool has the least staked", stats("staked", [], { rank: "least" })],
  ["top 3 by stakers", stats("stakers", [], { rank: "most", limit: 3 })],
]));

const each = (amount, pids = [], split = false) => ({ kind: "stakeEach", amount, pids, split });
test("staking into several nonprofits at once", () => cases([
  ["I have 12M OBN and there are a 11 nonprofits. I want to stake 1M more OBN to each of them resulting in 11M OBN being staked.", each(obn("1000000"))],
  ["stake 1M to each nonprofit", each(obn("1000000"))],
  ["stake 1,000 OBN to every charity", each(obn("1000"))],
  ["stake $5 to each nonprofit", each(usd("5"))],
  ["stake to all nonprofits", each(null)],
  ["split 11M across all nonprofits", each(obn("11000000"), [], true)],
  ["spread 50% of my OBN evenly across all the pools", each(pct("50"), [], true)],
  ["stake everything evenly across all nonprofits", each(ALL, [], true)],
  ["stake 100 each to tor and khan", each(obn("100"), [6, 4])],
  ["divide 3000 between tor, khan and heifer", each(obn("3000"), [6, 4, 1], true)],
  // Still one nonprofit, or still refused
  ["stake all my obn to st jude", action("stake", 7, ALL)],
  ["stake 100 to tor and khan", { kind: "unknown", reason: "multiple" }],
]));
test("a reply fills in a pending stake-to-each", () => {
  assert.deepEqual(parse("1,000", { pending: "stakeEach" }), each(obn("1000")));
  assert.deepEqual(parse("$2", { pending: "stakeEach" }), each(usd("2")));
});

const faq = topic => ({ kind: "faq", topic });
test("FAQ questions get the matching FAQ answer", () => cases([
  ["what is olive branch network", faq("about")], ["what is obn?", faq("about")], ["who are you", faq("about")],
  ["what blockchain is this on", faq("chain")], ["is obn on base?", faq("chain")],
  ["where can i buy obn", faq("buy")],
  ["how do i start staking", faq("howToStake")], ["how does staking work", faq("howToStake")],
  ["what is the apy", faq("apy")], ["how much will i earn", faq("apy")], ["how are rewards split", faq("apy")],
  ["what is extendolivebranch", faq("governance")], ["how does voting work", faq("governance")],
  ["what is the olive nft", faq("nft")], ["how do i mint an nft", faq("nft")],
  ["is there a minimum stake", faq("minimum")],
  ["can i unstake anytime", faq("unstakeAnytime")], ["is there a lock up period", faq("unstakeAnytime")],
  ["when do i get my rewards", faq("rewards")],
  ["what is auto claim", faq("autoclaimWhat")], ["when does autoclaim run", faq("autoclaimWhen")], ["how do i turn on auto claim", faq("autoclaimHow")],
  ["can i stake in multiple pools", faq("multiplePools")],
  ["are there any fees", faq("fees")], ["do i need eth for gas", faq("fees")], ["what are the fees to stake 100", faq("fees")],
  ["is this safe", faq("safety")], ["is it a scam", faq("safety")],
  ["how do i contact the team", faq("contact")], ["i have more questions", faq("contact")],
]));

test("FAQ matching never swallows commands, stats or personal questions", () => cases([
  ["stake 100 to tor", action("stake", 6, obn("100"))],
  ["can i unstake 100 from tor anytime", action("unstake", 6, obn("100"))],
  ["buy 100 obn", { kind: "unknown", reason: "swap" }],
  ["turn on auto claim", { kind: "autoclaim", mode: "on" }],
  ["is auto claim on?", { kind: "autoclaim", mode: "status" }],
  ["how much have i earned", { kind: "status", pid: null }],
  ["how many people stake in st jude", stats("stakers", [7])],
  ["how is st jude doing", stats("overview", [7])],
  ["whats the price of obn", stats("price")],
  ["never mind", { kind: "cancel" }],
]));

test("short replies", () => cases([
  ["yes", { kind: "confirm" }], ["ok", { kind: "confirm" }], ["do it", { kind: "confirm" }],
  ["no", { kind: "cancel" }], ["cancel", { kind: "cancel" }], ["never mind", { kind: "cancel" }],
  ["hi", { kind: "greet" }], ["thanks!", { kind: "thanks" }],
  ["hi oliver", { kind: "greet" }], ["thanks oliver!", { kind: "thanks" }], ["oliver, help", { kind: "help" }],
  ["help", { kind: "help" }], ["", { kind: "help" }], ["what can you do", { kind: "help" }],
  ["how do i stake?", { kind: "faq", topic: "howToStake" }], ["what is staking", { kind: "faq", topic: "howToStake" }],
]));

test("follow-up answers fill in the pending request", () => {
  const pending = { pending: "stake" };
  assert.deepEqual(parse("St Jude", pending), action("stake", 7, null));
  assert.deepEqual(parse("100", pending), action("stake", null, obn("100")));
  assert.deepEqual(parse("$5", pending), action("stake", null, usd("5")));
  assert.deepEqual(parse("all of it", pending), action("stake", null, ALL));
  assert.deepEqual(parse("never mind", pending), { kind: "cancel" });
  assert.deepEqual(parse("what is the price", pending), stats("price"));
  assert.deepEqual(parse("St Jude", { pending: "claim" }), { kind: "claim", pid: 7 });
});

test("every Oliver FAQ answer still matches a question on the FAQ page", async () => {
  const { FAQ } = await import("../src/lib/oliverFaq.ts");
  const fs = await import("node:fs");
  const faqPage = fs.readFileSync(new URL("../src/app/faq/page.tsx", import.meta.url), "utf8");
  for (const [topic, entry] of Object.entries(FAQ)) {
    assert.ok(faqPage.includes(`"${entry.faqQuestion}"`), `${topic}: "${entry.faqQuestion}" is no longer on /faq; update Oliver's answer`);
    assert.ok(entry.lines.length > 0, topic);
  }
});
