# Constitutional Decision Records — Process

A CDR is a one-page record of a decision: which Charter Articles it touches,
what the Constitutional Semantics found, what authority it required, and
what — if anything — remains unresolved. See
[`0001-canonical-public-benefit-registry.md`](0001-canonical-public-benefit-registry.md)
for a worked example, and [`TEMPLATE.md`](TEMPLATE.md) for the format to copy.

## When a CDR is required

A CDR is required whenever a change touches a `requires_tooling` or
`requires_judgment` requirement in
[`../constitutional-semantics/SEMANTICS.md`](../constitutional-semantics/SEMANTICS.md),
or changes the behavior of an `automatic` one. Concretely, that means changes
that:

- introduce, modify, or remove a Designation-affecting code path
  (Articles II, III),
- change how a Public Benefit recipient is verified or made eligible
  (Article IV, IX),
- touch disposition of undesignated value or governance process
  (Article V),
- change what gets recorded or how it's queried (Article VI),
- introduce a new top-level concept, or rename/split a canonical one
  (Article VII),
- amend the Charter itself (Article X).

A change that only touches code already covered by a passing `automatic`
check — a copy edit, a UI restyle, a performance optimization with no
behavioral change — does not need one. This is deliberately not "every PR."
The point is that no Charter-relevant decision should ever require a future
contributor to guess why it was made, not that every commit needs paperwork.

## What a CDR must include

1. The decision, in one sentence.
2. Which Articles it touches.
3. Its Authority Type, per
   [`../governance/AUTHORITY-TAXONOMY.md`](../governance/AUTHORITY-TAXONOMY.md).
4. Automatic findings — only for requirements actually `automatic`-tier and
   actually verified.
5. Interpretive findings — every `requires_tooling` / `requires_judgment`
   item touched, with reasoning. Never folded into "pass."
6. The outcome.
7. Any open constitutional question the decision surfaces, even if —
   especially if — this CDR doesn't resolve it.

## Numbering

CDRs are numbered sequentially and never renumbered or deleted, even if a
later decision reverses an earlier one. The reversal gets its own CDR,
referencing the one it supersedes.
