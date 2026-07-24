# The OBN Constitutional Commentary

Clause-by-clause interpretation of [`../charter/CHARTER.md`](../charter/CHARTER.md).
This document carries the *why* and the *consequences* deliberately stripped out
of the Charter itself — the Charter states; this explains.

**Format.** Every entry in this document answers the same seven questions —
Intent, Historical background, Architectural consequences, Database
consequences, API consequences, AI consequences, Future governance
implications — in that order. This structure is binding for any future
addition: a new or amended entry that skips a question must say explicitly
that there's nothing distinct to add at that layer, not silently omit it.
Where two or more layers genuinely produce the same consequence, they may be
answered together rather than padded into artificially separate paragraphs —
several entries below already do this — but the question must still have
been asked.

### Article I — Purpose
**Intent:** Give every other Article a reason to exist before any of them
constrain behavior.
**Historical background:** Positions OBN against both ordinary DeFi (yield for
the holder alone) and ordinary philanthropy (benefit requiring sacrifice) — a
third category, not a blend of the two.
**Architectural consequences:** Any new product line is tested against "does
this still let someone keep what they own while directing its yield." A
feature requiring surrendered principal is a different product wearing OBN's
name.
**Database consequences:** No schema may require an asset transfer-out as a
precondition of directing its yield.
**API consequences:** No endpoint may model "support a cause" as a custody
transfer. Every capability must be expressible as a non-custodial instruction.
**AI consequences:** An agent must never describe staking using donation
language ("you gave," "you donated") — Article I makes that description
false, not just imprecise.
**Future governance implications:** A proposal asking Participants to forfeit
principal in exchange for impact is a Purpose violation, not a tokenomics
tradeoff to be weighed.

### Article II — Consent
**Intent:** Make voluntariness a binding rule, not an incidental fact about
today's UX.
**Historical background:** Nearly every historical public-benefit mechanism —
taxation, tithing mandates, compulsory levies — begins from obligation. This
Article protects the thing that makes OBN unusual: it begins from choice.
**Architectural consequences:** Forbids any default-on mechanism that creates
or modifies a Designation without affirmative action — including opt-out
patterns that exploit inertia.
**Database consequences:** Every Designation record must carry the timestamp
and method of the consent event that created or modified it. A Designation
without a recorded consent event is invalid regardless of other fields.
**API consequences:** No endpoint may create or alter a Designation as a side
effect of another action. Consent is its own explicit, separately authorized
call.
**AI consequences:** An agent may recommend a Designation; it may never
execute one without a fresh, specific confirmation for that action. A
standing instruction does not retroactively authorize a new kind of action
the agent wasn't asked to take.
**Future governance implications:** A proposal that increases participation
by reducing the friction of opting *out* rather than opting *in* is presumed
to violate this Article until shown otherwise.

### Article III — Separability
**Intent:** State the mechanism that makes OBN distinct from both DeFi and
philanthropy.
**Historical background:** Trusts, endowments, and annuities have separated
benefit from ownership for centuries. OBN is a continuous, individually
attributable, real-time version of an old legal idea, not a novel one.
**Architectural consequences:** Any mechanism realizing a Designation must
leave principal fully withdrawable at all times, subject only to mechanically
necessary delays — never to forfeiture.
**Database consequences:** Principal balance and directed-value history must
be modeled as separate, independently auditable quantities.
**API consequences:** Every balance endpoint must answer "what does this
Participant still own" and "what have they directed" as two distinct numbers.
**AI consequences:** An agent reporting impact must be able to show principal
as untouched; if it can't retrieve that figure, it shouldn't report the
impact figure either.
**Future governance implications:** A proposal introducing slashing or
lock-up forfeiture is a new product outside this Article's guarantee, not an
enhancement to staking.

### Article IV — Accountability
**Intent:** Ensure "directing value to public benefit" is never just a claim.
**Historical background:** Conventional philanthropy relies on regulators
(IRS, Charity Commission, CRA) as its accountability backstop. OBN inherits
that backstop today rather than replacing it, because no comparably scaled
alternative yet exists.
**Architectural consequences:** No mechanism may route emissions to an
address without an attached, independently checkable accountability claim.
**Database consequences:** Every recipient record must link to externally
sourced verification — not just a name and logo supplied by the recipient or
the protocol operator.
**API consequences:** Any endpoint listing eligible recipients must expose
the basis for verification, not just list membership.
**AI consequences:** An agent recommending or comparing recipients must cite
the verification evidence it used, and must say so explicitly when that
evidence is thin or stale.
**Future governance implications:** A proposal to add a recipient on
community reputation alone, without independent registration, tests this
Article directly.

### Article V — Commons
**Intent:** Decide once who has authority over unclaimed value, so it's never
improvised by whoever is operating the system at the time.
**Historical background:** The Article with the most kinship to crypto-native
"rules over rulers" thinking rather than philanthropic tradition.
**Architectural consequences:** Any contract holding undesignated emissions
must expose a governance-gated, not operator-gated, disposition mechanism.
**Database consequences:** Governance decisions and the value they dispose of
must be modeled as first-class, queryable history — not folded into generic
treasury transactions.
**API consequences:** The API must expose what's currently undesignated and
awaiting governance at any time, visible to anyone.
**AI consequences:** An agent helping cast a Governance decision must
represent options and tallies faithfully, and must never cast a decision the
Participant didn't specifically authorize for that vote. (Article II applied
to governance specifically.)
**Future governance implications:** A proposal letting the team make
discretionary calls on undesignated funds "for efficiency" is the most direct
violation of this Article possible.

**Open question (see CDR #1):** This Article governs disposition of
undesignated *value*. It is currently silent on who should govern *recipient
eligibility* — today a Timelock/Safe decision, not a community vote. Whether
that's the intended design or a gap is unresolved.

### Article VI — Verifiability
**Intent:** Make every other Article enforceable by something other than
trust in whoever is running the system.
**Historical background:** The one place blockchain specifically, rather than
technology in general, has mattered.
**Architectural consequences:** A new mechanism must emit a permanent,
externally readable record of its consequential actions before it can be
considered complete.
**Database consequences:** The database mirrors the record; it is never the
source of it. Where they disagree, the external record wins, and the
discrepancy itself must be recorded.
**API consequences:** Every endpoint reporting a consequential fact must
point to the record it was derived from.
**AI consequences:** An agent must be able to show its sources for any
factual claim about what happened on the protocol, and must distinguish a
verified fact from an interpretive judgment rather than presenting both with
equal confidence.
**Future governance implications:** A proposal relying on a cached or
estimated figure instead of the verifiable record, without labeling it as
such, violates this Article even when the estimate is usually right.

### Article VII — Definitions
**Intent:** Fix vocabulary so every document, system, and conversation about
OBN means the same thing by the same word.
**Historical background:** This protocol has already lived through the
alternative once — three independent, disagreeing nonprofit-identity records
existed before this Charter did.
**Architectural / Database / API / AI consequences:** Every layer must use
the six canonical terms as primary names for these concepts. A layer that
invents a parallel term for the same idea has reintroduced the exact problem
this Charter exists to prevent — though a new *implementation mechanism*
realizing one of the six concepts (an append-only ledger realizing Record,
for instance) is not itself a violation.
**Future governance implications:** Renaming or splitting one of these six
terms is, in effect, a Charter amendment, and must go through Article X.

### Article VIII — The Constraint
**Intent:** Give every other Article one mechanical test that doesn't require
re-deriving the philosophy for each new decision.
**Historical background:** Adds no new requirement — makes Articles II–VI
jointly checkable in one pass.
**Architectural / Database / API / AI consequences:** Identical to the
consequences already listed under Articles II–VI.
**Future governance implications:** A "yes" to all six clauses is necessary,
not sufficient. The Constraint filters out what doesn't belong; it doesn't
approve what remains. The cleanest-code and best-product questions still
apply afterward — this Article doesn't replace ordinary engineering judgment,
it gates what's allowed to reach it.

### Article IX — Scope of Binding Force
**Intent:** Stop future contributors from treating implementation choices as
if they were constitutional.
**Historical background:** Exists because earlier architecture discussion
repeatedly found implementation details defended as permanent truths when
they weren't.
**Architectural / Database / API / AI consequences:** None directly — that's
the point.
**Future governance implications:** Expanding eligible Public Benefit beyond
nonprofit registration is a policy change under this Article, requiring
ordinary governance approval, not a Charter amendment.

### Article X — Amendment
**Intent:** Protect the Charter from being quietly rewritten by whoever
currently has commit access.
**Historical background:** Article V applied to the Charter's own text.
**Architectural / Database / API / AI consequences:** Tooling that reads this
Charter programmatically must treat the current ratified text as authoritative
until a governance-amended version is published.
**Future governance implications:** A community that lets this process be
bypassed once has, in effect, repealed the whole Charter.
