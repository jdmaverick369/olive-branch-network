# CDR #1 — Canonical Public Benefit Registry

**Decision**
Consolidate nonprofit identity — previously split across `nonprofits.js`
(PID→wallet, used by governance ops scripts), `pools.ts` (PID→display
metadata, hand-maintained in the frontend), and the Supabase `nonprofits`
table (EIN→filings) — into one canonical Public Benefit record.

**Articles touched**
IV, VI, VII

**Authority Type**
Engineering — see [`../governance/AUTHORITY-TAXONOMY.md`](../governance/AUTHORITY-TAXONOMY.md).
This is a refactor that satisfies an existing Charter requirement (Article
VII) more completely; it doesn't change what's constitutionally required, so
it needs to pass the Constraint (Article VIII), not a governance vote. The
*open question* this CDR surfaces below is a different matter — resolving it
would plausibly be Constitutional or Governance tier, not Engineering.

**Findings — Automatic**

| Article | Requirement | Result |
|---|---|---|
| VII | `no_parallel_concepts` | FAIL as-is (three records for one concept); PASS once consolidated |
| IV | `verification_source_present` | Not yet implemented; required field on the canonical record |
| IV | `verification_date_present` | Not yet implemented; required field on the canonical record |
| IV | `verification_status_current` | Not yet implemented; required field on the canonical record |
| VI | `immutable_record_exists` | Not yet implemented; requires an append-only wallet/pool history ledger, not an editable column |
| VI | `discrepancy_logging` | Not yet implemented; same ledger |

**Findings — Interpretive**

- **IV / `verification_source_trustworthy`** — Today's nonprofit-registration
  sources (IRS Form 990, CRA T3010, UK Charity Commission iXBRL) are accepted
  as trustworthy under current Article IX policy. This is a policy call, not
  an automatic fact, and should be revisited if Public Benefit's scope ever
  expands beyond registered nonprofits.
- **V — silent.** Article V governs collective authority over *disposition of
  undesignated value*. It says nothing about who decides whether a *candidate*
  nonprofit is *eligible* in the first place. That remains a Timelock/Safe
  (operator) decision today. Not a violation — Article V doesn't reach this
  question — but a genuine gap in what the Charter currently answers.

**Outcome**
Proceed with canonical registry consolidation.

**Open constitutional question**
Should recipient eligibility itself eventually require governance approval, in
addition to Article V's existing requirement over value disposition? Unresolved
— first candidate for actual governance discussion, not further architecture
writing.
