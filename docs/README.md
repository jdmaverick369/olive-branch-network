# OBN Constitutional Documentation

This repository holds the layered foundation produced when OBN's architecture was
re-examined from first principles, before building a public API, MCP server, or
further AI integration on top of the protocol.

Each layer answers a different question. None of them tries to answer all of them.

| Layer | Answers | Changes how often |
|---|---|---|
| [`philosophy/`](philosophy/README.md) | Why does OBN exist at all? | Essentially never |
| [`charter/`](charter/CHARTER.md) | What must always remain true? | Only by governance amendment (Article X) |
| [`commentary/`](commentary/COMMENTARY.md) | What does each Article actually require? | Slowly, with governance review |
| [`constitutional-semantics/`](constitutional-semantics/SEMANTICS.md) | How is each requirement tested? | With tooling, as engineering allows |
| [`cdr/`](cdr/) | Why was a specific decision made? | Continuously — this is the living history |
| [`governance/`](governance/AUTHORITY-TAXONOMY.md) | What kind of authority does this decision require? | Rarely — only as new authority types are identified |

The test for all of it is not whether it's internally coherent. It's whether it
makes real engineering decisions clearer than they would have been without it.
See `cdr/0001-canonical-public-benefit-registry.md` for the first decision run
through the full stack.

## Status

Phase 1 — philosophy, Charter, Commentary, Semantics, and a first CDR — is
complete. The Charter is frozen at v0.1 pending implementation validation
(see `charter/CHARTER.md`). No further foundational documents are planned
until several more decisions have been run through the stack:

- CDR #2 — Public API
- CDR #3 — Canonical Public Benefit schema
- CDR #4 — MCP integration
- CDR #5 — AI-assisted staking flow

If those continue to produce clearer engineering outcomes than the team would
have reached without the framework, that's the actual validation — not
anything written here.

## Publication status

This `docs/` tree is the public home of OBN's constitutional documentation.
Publication makes these materials available for review; it does not by itself
ratify the Charter. The Charter remains frozen at v0.1 pending implementation
validation and must go through the amendment and ratification process described
in Article X before it is treated as binding.
