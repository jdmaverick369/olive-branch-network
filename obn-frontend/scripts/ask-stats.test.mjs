import assert from "node:assert/strict";
import { test } from "node:test";
import { answerStats } from "../src/lib/askStats.ts";
import { POOLS } from "../src/lib/pools.ts";

// Small fixture in the shape of src/data/analytics.json.
const rows = (values) => values.map(([day, activeStakers, totalStaked, totalContributed]) => ({ day, activeStakers, totalStaked, totalContributed }));
const snapshot = {
  schema: 1, chainId: 8453, contract: "0x2c4bd5b2a48a76f288d7f2db23afd3a03b9e7cd2",
  generatedAt: "2026-10-02T08:00:00Z", throughBlock: 1, throughTimestamp: "2026-10-02T07:31:25Z", definitions: {},
  rows: rows([["2026-09-01", 180, 150_000_000, 600_000], ["2026-09-25", 200, 180_000_000, 680_000], ["2026-10-02", 205, 186_000_000, 693_000]]),
  pools: {
    7: { contributions: 50_000, seedClaims: 30_000, annualAwards: 0, rows: [{ day: "2026-09-25", activeStakers: 25 }, { day: "2026-10-02", activeStakers: 30 }] },
    6: { contributions: 1_000, seedClaims: 0, annualAwards: 0, rows: [{ day: "2026-10-02", activeStakers: 1 }] },
    8: { contributions: 9_000, seedClaims: 1_000, annualAwards: 0, rows: [{ day: "2026-10-02", activeStakers: 12 }] },
  },
};
const data = { snapshot, poolStaked: new Map([[7, 12_000_000], [6, 500], [8, 2_000_000]]), price: 0.00002, change24h: -1.28 };
const ask = (cmd) => answerStats({ kind: "stats", pids: [], rank: null, limit: null, days: null, ...cmd }, POOLS, data);

test("stakers per nonprofit, with change over time", () => {
  assert.deepEqual(ask({ metric: "stakers", pids: [7] }), ["30 people are staking with St. Jude Children's Research Hospital (as of Oct 2)."]);
  assert.deepEqual(ask({ metric: "stakers", pids: [6] }), ["1 person is staking with Tor Project (as of Oct 2)."]);
  assert.deepEqual(ask({ metric: "stakers", pids: [7], days: 7 })[1], "That's up 5 over the last week.");
});

test("protocol totals and period changes", () => {
  assert.deepEqual(ask({ metric: "stakers" }), ["205 people are staking OBN (as of Oct 2)."]);
  assert.match(ask({ metric: "stakers", days: 30 })[1], /up 25 over the last 30 days/);
  assert.match(ask({ metric: "contributed", days: 7 })[0], /^13K OBN \(~\$0\.26\) went to nonprofits over the last week/);
  assert.match(ask({ metric: "contributed" })[0], /^693K OBN \(~\$13\.86\) has gone to nonprofits so far/);
  assert.match(ask({ metric: "staked" })[0], /^14M OBN \(~\$280\.01\) is staked across 11 nonprofits\.$/);
});

test("per-nonprofit staked and contributed", () => {
  assert.match(ask({ metric: "staked", pids: [7] })[0], /^12M OBN \(~\$240\.00\) is staked with St\. Jude.*That's 85\.7% of all staked OBN\.$/);
  assert.match(ask({ metric: "contributed", pids: [7] })[0], /has received 80K OBN \(~\$1\.60\) so far \(as of Oct 2\)/);
  assert.equal(ask({ metric: "contributed", pids: [7], days: 30 }).length, 2, "explains there is no monthly breakdown");
});

test("rankings", () => {
  assert.deepEqual(ask({ metric: "stakers", rank: "most" }), [
    "Top 3 by stakers (as of Oct 2):",
    "1. St. Jude Children's Research Hospital: 30 stakers",
    "2. charity: water: 12 stakers",
    "3. Tor Project: 1 staker",
  ]);
  assert.deepEqual(ask({ metric: "staked", rank: "least", limit: 1 }), ["Fewest staked:", "1. Tor Project: 500 OBN (~$0.01)"]);
});

test("overview, compare, price and pool list", () => {
  const overview = ask({ metric: "overview", pids: [7] });
  assert.equal(overview[0], "St. Jude Children's Research Hospital");
  assert.equal(overview[1], "Stakers: 30");
  assert.equal(ask({ metric: "overview", pids: [6, 7] }).length, 2);
  assert.match(ask({ metric: "overview" })[0], /^205 people stake 14M OBN/);
  assert.deepEqual(ask({ metric: "price" })[0], "OBN is $0.00002 (-1.28% in 24h).");
  assert.equal(ask({ metric: "pools" })[0], "There are 11 nonprofits you can stake with:");
});

test("missing data gives an honest answer", () => {
  const none = answerStats({ kind: "stats", metric: "stakers", pids: [], rank: null, limit: null, days: null }, POOLS, { snapshot: null, poolStaked: null, price: null, change24h: null });
  assert.match(none[0], /can't load the analytics/);
  assert.match(answerStats({ kind: "stats", metric: "price", pids: [], rank: null, limit: null, days: null }, POOLS, { snapshot: null, poolStaked: null, price: null, change24h: null })[0], /can't get the OBN price/);
});
