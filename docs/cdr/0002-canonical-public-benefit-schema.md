**Decision**
Extend the existing Supabase `nonprofits` table with chain-identity and
display fields (`chain_address`, `pid`, `logo`, `category`,
`list_description`, `detail_description`, `twitter_url`, `verify_url`,
`on_base_app`), host the canonical Public Benefit API in `obn-database`
rather than `obn-frontend`, and retire `pools.ts`, `nonprofit-logos.ts`, and
eventually `nonprofits.js` as independent data sources. The underlying table
keeps its existing name (`nonprofits`); the canonical vocabulary applies to
the API and documentation layer, not to renaming working SQL.

**Articles touched**
IV, VI, VII

**Authority Type**
Engineering — see [`../governance/AUTHORITY-TAXONOMY.md`](../governance/AUTHORITY-TAXONOMY.md).
Implements CDR #1's consolidation decision at the schema level; does not
change what's constitutionally required.

**Findings — Automatic**

| Article | Requirement | Result |
|---|---|---|
| VII | `no_parallel_concepts` | PASS once `pools.ts` and `nonprofit-logos.ts` are retired |
| IV | `verification_source_present` / `verification_date_present` | Already present in the existing `filings` schema (`source_url`, `tax_year`) — no new field needed, just needs to be surfaced through the new API |
| VI | `publicly_queryable` | PASS — the new API is read-only and requires no auth |

**Findings — Interpretive**

- **III / VI — wallet-history depth (the first real fork).** The alternative
  was a full append-only `wallet_history` ledger (one row per rotation,
  never overwritten), matching the deeper identity-bridge design discussed
  earlier in this process. Rejected for now: across this protocol's entire
  history, wallet rotation has happened a handful of times, each already
  recorded as a one-off file in `governance-operations/`. Building a
  bitemporal ledger before a single real problem has been caused by its
  absence is exactly the speculative complexity this phase is supposed to
  avoid. `chain_address` and `pid` are flat, current-state columns — Article
  VI's `discrepancy_logging` requirement is satisfied for *current* state, not
  full history. If a real need for the history surfaces (most likely: the
  impact-narrative feature needing correct attribution across a rotation
  event), the evolution path is a single `wallet_history` table added later,
  not a redesign.
- **VII — where this lives (the second real fork).** The alternative was
  building the API inside `obn-frontend`, next to the existing `/api/causes`
  precedent. Rejected: the richest identity data already lives in
  `obn-database`'s Supabase instance; putting the API anywhere else would
  create a second place that talks to the data, which is the same shape of
  problem Article VII already exists to prevent, just one layer up from
  table design.
- **VII — table naming.** Renaming the live `nonprofits` table to match
  "Public Benefit" literally was considered and rejected. Article VII's
  concern is duplicate *concepts*, not literal identifier matching — the
  rename would touch every query in `obn-database` (`page.tsx`,
  `NonprofitDetailUS/CA/UK.tsx`, `list-orgs.ts`, `delete-orgs.ts`,
  `import.ts`, `check-filings.ts`) for no constitutional benefit. This is
  ordinary engineering judgment operating *after* the constitutional gate,
  per Article VIII's commentary — the gate doesn't reach naming.
- **`live` flag.** Recommended to become derived from on-chain pool state
  rather than hand-maintained, but not verified against the actual reason it
  was introduced — flagged for confirmation before removal, not yet decided.

**Outcome**
Proceed with schema extension and API hosted in `obn-database`. Defer
wallet-history ledger and Category join table.

**Open constitutional question**
None new. Inherits CDR #1's open question about eligibility governance,
unaffected by this decision.
