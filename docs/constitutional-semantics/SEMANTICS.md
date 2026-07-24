# The OBN Constitutional Semantics

Defines what each Article in [`../charter/CHARTER.md`](../charter/CHARTER.md)
requires *operationally*. This is the layer CI, MCP tooling, and AI agents
should consult to check a proposal — see [`../commentary/COMMENTARY.md`](../commentary/COMMENTARY.md)
for why each requirement exists.

**Tier legend:** `automatic` — checkable today against existing data.
`requires_tooling` — well-defined, needs static-analysis or formal-verification
work that doesn't exist yet. `requires_judgment` — assist with AI reasoning,
never auto-pass; always routes to human or governance review.

A result built from this spec must always surface which tier produced it. An
`automatic` pass and a `requires_judgment` assessment are not the same kind of
answer, and presenting them identically is itself a Verifiability (Article VI)
violation.

```yaml
ArticleI_Purpose:
  requirements:
    - id: principal_never_required_as_input_to_benefit
      check: no feature requires irreversible transfer of a Participant's
             asset as a precondition of directing its value
      tier: requires_judgment
  note: Largely satisfied transitively by Articles II, III, and V.
        Exists as an explicit backstop for mechanisms novel enough that
        no existing requirement anticipated them.

ArticleII_Consent:
  requirements:
    - id: explicit_user_action_required
      check: Designation record references a discrete authorization event
             distinct from any other transaction
      tier: automatic
    - id: timestamped
      check: consent event carries a timestamp and tx hash
      tier: automatic
    - id: revocable
      check: a withdrawal/revoke path exists with no lockup beyond a
             declared, fixed, mechanically necessary delay
      tier: requires_tooling
    - id: no_opt_out_defaults
      check: no code path creates or extends a Designation without a
             preceding consent event for that specific Designation
      tier: requires_tooling
    - id: no_side_effect_designations
      check: Designation creation is never bundled into an unrelated
             user action (wallet connect, claim, etc.)
      tier: requires_judgment

ArticleIII_Separability:
  requirements:
    - id: principal_withdrawable
      check: a withdraw function is reachable by the asset owner at all
             times, subject only to declared fixed delays
      tier: requires_tooling
    - id: no_forfeiture_condition
      check: no code path reduces principal as a consequence of a
             Designation, governance outcome, or protocol action
      tier: requires_tooling
    - id: principal_and_directed_value_distinguishable
      check: API/database expose principal balance and lifetime directed
             value as separate, independently queryable fields
      tier: automatic

ArticleIV_Accountability:
  requirements:
    - id: external_verification_required
      check: every recipient record references a verification source
             outside the protocol's own assertion
      tier: automatic
    - id: verification_source_present
      check: verification_source field is non-null and resolves to a
             checkable external record
      tier: automatic
    - id: verification_date_present
      check: verified_at timestamp exists
      tier: automatic
    - id: verification_status_current
      check: re-verified within the declared staleness threshold
      tier: automatic
    - id: verification_source_trustworthy
      check: cited source is a recognized regulator/registry per current
             Article IX policy, not an arbitrary URL
      tier: requires_judgment

ArticleV_Commons:
  requirements:
    - id: no_unilateral_disposition
      check: any function moving undesignated value requires a
             governance-gated access modifier, never owner/admin-only
      tier: requires_tooling
    - id: undesignated_value_visible
      check: API exposes current undesignated balance and disposition
             status at all times
      tier: automatic
    - id: governance_decisions_immutable
      check: executed Governance outcomes cannot be altered by any
             non-governance action
      tier: requires_tooling

ArticleVI_Verifiability:
  requirements:
    - id: immutable_record_exists
      check: every Designation, Contribution, and Governance action
             emits a permanent, immutable log entry
      tier: automatic
    - id: publicly_queryable
      check: record is retrievable by any party without operator
             permission
      tier: automatic
    - id: discrepancy_logging
      check: any divergence between a cached value and the underlying
             record is itself recorded, never silently corrected
      tier: automatic
    - id: reproducible
      check: an independent party can recompute a reported figure from
             the raw record using a published method
      tier: requires_tooling

ArticleVII_Definitions:
  requirements:
    - id: canonical_terms_only
      check: schema, API, MCP tool names, and agent vocabulary use the
             six canonical terms as primary names
      tier: automatic
    - id: no_parallel_concepts
      check: no new entity duplicates an existing canonical concept
             under a different name
      tier: requires_judgment

ArticleVIII_Constraint:
  requirements:
    - id: all_prior_articles_pass
      check: Articles II through VI all report passing status
      tier: automatic
  note: No independent tests — the logical AND of Articles II-VI.
        Passing is necessary, not sufficient.

ArticleIX_Scope:
  requirements:
    - id: change_classified_correctly
      check: changes to chain, token mechanics, governance cadence, or
             eligibility are tagged as policy/engineering, not submitted
             as Charter amendments
      tier: requires_judgment

ArticleX_Amendment:
  requirements:
    - id: amendment_via_governance_only
      check: any modification to ratified Charter text is preceded by a
             recorded Governance decision authorizing it
      tier: automatic
    - id: current_ratified_text_referenced
      check: CI, MCP, and agent tooling load the latest governance-
             ratified Charter text, never an unmerged draft
      tier: automatic
```
