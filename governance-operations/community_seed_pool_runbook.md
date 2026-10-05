# OBN — Onboard a Nonprofit Pool via Community Seeding

Reserve update: consolidation is complete. The 300M OBN allocation includes 11M already seeded and 289M remaining at consolidation for 289 additional 1M seeds. A separate 50M OBN protocol reserve remains. This reserve capacity is not a pool cap and does not itself imply the v9.4/Seed contracts have been deployed.

For any pool whose 1,000,000 OBN genesis bootstrap can no longer be funded from the operator
Safe's own OBN balance — in practice, once the Safe's consolidated 300,000,000 OBN reserve is
drawn down (expected after 300 seeds in total, but that's a consequence of the reserve running
out, not a rule the protocol enforces at any specific pool ID — a pool could in principle be
Safe-funded past that point if the Safe is topped up, or need community funding earlier if the
Safe's balance were spent down faster than expected). Requires the one-time v9.4 upgrade in
`v94_upgrade_runbook.md` to already be live. Check the Safe's current OBN balance against
`(pools remaining to bootstrap) × 1,000,000` before deciding which path a given pool needs.

Steps 1–3 are **identical** to the standard flow in `add_pool_runbook.md` — the pool itself is
still added through the Timelock exactly as before, regardless of how it gets funded. Only the
bootstrap step (Step 4 there) changes: no Safe transaction, no multisig — the community funds
it directly through `Seed`, as a pure donation.

**Reminder from v9.4:** once this pool is added but before its campaign fills, the public
cannot yet `deposit()`/`depositFor()` into it — the staking contract now requires a pool to be
bootstrapped first. Contributing through `Seed` is unaffected by this (it's a
separate contract); only ordinary public staking is gated.

---

## Addresses

| Contract | Address |
|---|---|
| StakingPools (proxy) | `0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2` |
| Seed | *(see `.env` `SEED_ADDR`, set during the v9.4 upgrade)* |

---

## Steps 1–3: Add the pool (unchanged)

Follow `add_pool_runbook.md` Steps 1–3 exactly: schedule `addPool` + `setApprovedNonprofit`
through the Timelock, wait 24h, execute. Confirm on Basescan that `poolLength()` incremented
and `getPoolInfo(pid)` returns the correct charity wallet, same as always.

## Step 4 — Publicize the campaign

Announce publicly: the pool's `pid`, the `Seed` contract address, and the
current minimum contribution (call `minContribution()` — don't hardcode it in announcements,
since it's adjustable and will change as OBN's price moves). The target itself
(`SEED_AMOUNT`, 1,000,000 OBN) is fixed and can be stated directly.

Rules to communicate clearly, since this is a donation, not a typical crowdfund:
- **This is a pure donation.** Contributors receive nothing back beyond an on-chain record of
  their contribution (the `contributions` ledger and `ContributionReceived` events) — useful
  for the contributor's own records if a donation of this kind ever has tax write-off
  implications, but there is no token, badge, or financial claim of any kind.
- **One contribution per address, per campaign.** A wallet can contribute once to this pool's
  seed; if it later wants to help seed a different nonprofit's pool, that's a separate
  campaign and a separate allowance.
- **The campaign can never raise more than exactly 1,000,000 OBN.** If someone's contribution
  would push the total over the target, only the amount still needed is pulled from their
  wallet — the rest simply never leaves it. This means whoever happens to complete the
  campaign may end up contributing less than they offered.
- **Refundable until funded.** Contributions can be withdrawn any time before the campaign
  completes via `withdrawContribution` — but withdrawing does not free up a new attempt; each
  address gets exactly one shot per campaign.

## Step 5 — Monitor

```bash
node scripts/governance/check_campaign_status.js --pid <N>
```

The campaign auto-finalizes (locks the raised OBN into the pool via `charityFundBootstrap`,
which also opens the pool to public staking) the moment a `contribute()` call reaches exactly
1,000,000 OBN raised — this happens atomically within that same transaction, so under normal
EVM semantics there's no scenario where a contribution lands, the total hits the target, and
finalization simply fails to run (a revert anywhere in that transaction reverts the whole
contribution too). `finalize(pid)` still exists as a permissionless entry point for other
integration paths, but you should not expect to ever need it for a stuck campaign in the
current contract.

## Step 6 — Verify

Same checks as `add_pool_runbook.md` Step 4, plus the new campaign data:
- `StakingPools.userAmount(pid, charityWallet)` and `lockedAmount(pid, charityWallet)` —
  should equal exactly 1,000,000 OBN (never more — see the hard-cap note above).
- `StakingPools.poolBootstrapped(pid)` — should now be `true`; public `deposit()`/`depositFor()`
  calls into this pool should succeed from here on.
- `Seed.campaigns(pid)` — `funded` should be `true`.
- `Seed.contributions(pid, *)` and the `ContributionReceived`/`CampaignFunded`
  events — the donation record for each contributor.

---

## Notes

- **Hard cap, no overshoot.** Unlike a typical crowdfund, this contract structurally cannot
  raise more than `SEED_AMOUNT` — it only ever pulls exactly as much OBN as is still needed.
- **Pure donation — no reward mechanism.** Nothing is minted, returned, or owed to a
  contributor beyond the on-chain contribution record. This is intentional: it keeps the
  contract's scope to fund-tracking only, with no new financial primitive.
- **If a pool onboarding is abandoned** before its campaign fills (the Timelock calls
  `shutdownPool`/`removePool`), anyone can call `Seed.markCancelled(pid)` to
  block further contributions; existing contributors already have a working exit via
  `withdrawContribution` regardless of whether `markCancelled` has been called.
- **The legacy Safe-funded path still exists.** `charityFundOperator` (the operator Safe) is
  untouched by v9.4 — it can still directly fund a bootstrap for any pool, community-seeded or
  not, via the existing `gen_safe_bootstrap.js` flow, e.g. for a sponsor who wants to fund a
  specific nonprofit outright rather than crowdfund it. That path is also unaffected by the new
  poolBootstrapped gate, since `charityFundBootstrap` is exactly what sets that flag.
- **Do not call `updateCharityWallet` on a pool with an active `Seed` campaign.** `Seed` locks
  a campaign's beneficiary to whatever charity wallet was current on its first contribution and
  re-checks that on every later contribution and at finalize — if the wallet changes
  mid-campaign, further `contribute()`/`finalize()` calls revert with `"charity wallet changed
  mid-campaign"` rather than silently redirecting already-escrowed donations. This is
  permanent for that pid's campaign object: there is no way to point it at the new wallet, even
  if you rotate the wallet back later to something other than the exact original address.
  Contributors can still get their donations back via `withdrawContribution`. If a wallet
  genuinely must change while a campaign is active (e.g. a compromised wallet), abandon that
  `Seed` campaign and fund the pool's bootstrap through the legacy Safe-funded path instead
  (`gen_safe_bootstrap.js`) — that path reads the pool's current wallet directly and isn't
  affected by anything `Seed` has recorded.
- **Once a campaign is funded, this pool is bootstrapped exactly like any other — future wallet
  rotations follow `charity_wallet_runbook.md`'s normal rule, with no special case for
  community-seeded pools.** A funded `Seed` campaign locks the raised OBN into the pool via the
  same `charityFundBootstrap` → `userAmount`/`lockedAmount` path as a Safe-funded bootstrap; the
  contract does not record which path funded a pool, so nothing distinguishes them once
  `campaigns(pid).funded` is `true`. `updateCharityWallet` alone is **not** valid for this pool
  from that point forward — any future rotation must go through `migrateBootstrap`
  (`gen_safe_migrateBootstrap.js`), never `gen_safe_updateCharityWallet.js` alone. This isn't
  just a process rule: `OBNStakingPoolsV94.updateCharityWallet` reverts on-chain
  (`"bootstrapped: use migrateBootstrap"`) for any pool with `userAmount(pid, currentWallet) > 0`,
  which is true for a funded community campaign the exact same way it's true for a Safe-funded
  one — the contract itself makes no distinction. Don't assume "it came from `Seed`, so the rules
  must be different." They aren't, and now the chain enforces that regardless of who's asking.
