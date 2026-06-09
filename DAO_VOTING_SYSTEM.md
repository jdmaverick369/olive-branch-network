# Olive Branch Network DAO Voting System

## Stake-Weighted Governance Concept

### 1. Overview

The Olive Branch Network DAO voting system is intended to be simple, transparent, and aligned with actual protocol participation.

Instead of using a one-wallet-one-vote model, voting power will be based on the amount of OBN a user has actively staked in the protocol.

In simple terms:

```text
Voting Power = Staked OBN at Snapshot
```

This means users who have more OBN staked will have more voting power, while users who have less OBN staked will have less voting power.

The goal is to create a governance system where influence is tied to real participation in the protocol rather than the number of wallets a person controls.

---

### 2. Why OBN Should Not Use One-Wallet-One-Vote

A one-wallet-one-vote system may appear democratic, but it can be vulnerable to Sybil behavior.

A Sybil attack happens when one person creates or controls many wallets in order to gain more influence than they should have.

For example:

```text
1 person with 1 wallet = 1 vote
1 person with 100 wallets = 100 votes
```

This would allow someone to increase their influence by splitting across many wallets, even if their actual economic commitment to the protocol has not changed.

For OBN, this is especially important because DAO votes may eventually determine what happens to protocol-controlled funds. Governance should not be easy to manipulate by simply creating more wallets.

For this reason, OBN should avoid a pure wallet-based voting model.

---

### 3. Stake-Weighted Voting

OBN governance should use a stake-weighted voting model.

Under this model, voting power is proportional to the amount of OBN a user has staked in the protocol.

For example:

```text
10,000 OBN staked = 10,000 voting power
1,000,000 OBN staked = 1,000,000 voting power
```

This creates a direct relationship between protocol participation and governance influence.

Users who stake more OBN have more voting power because they have more value committed to the protocol.

---

### 4. Why Stake-Weighted Voting Reduces Sybil Risk

Stake-weighted voting reduces the benefit of splitting tokens across multiple wallets.

For example:

```text
1 wallet with 1,000,000 OBN staked
= 1,000,000 voting power
```

If that same user splits the OBN across 100 wallets:

```text
100 wallets with 10,000 OBN staked each
= 1,000,000 total voting power
```

The total voting power remains the same.

This makes stake-weighted voting much harder to manipulate through wallet creation alone. A user cannot gain additional voting power simply by creating more wallets. Their influence is tied to the total amount of OBN they have staked.

---

### 5. Voting Snapshot

To keep the voting process fair and predictable, voting power should be measured using a snapshot.

A snapshot is a recorded point in time that determines how much voting power each eligible user has for a specific vote.

In the OBN voting system:

```text
Voting power is based on the amount of OBN staked at the snapshot.
```

If a user stakes after the snapshot, that stake may still earn rewards, but it would not count toward voting power for that specific vote.

This prevents users from waiting until a vote is already active before staking just to influence the outcome.

---

### 6. No Unstaking Cooldown at Launch

To preserve a strong user experience, OBN does not need to introduce an unstaking cooldown at the beginning of DAO governance.

A cooldown period may add governance protection, but it also creates friction for users. If users feel locked into staking, the protocol may become less accessible and less attractive to new participants.

OBN should prioritize a smooth staking experience.

The preferred starting model is:

```text
No unstaking cooldown
Voting power equals staked OBN at the snapshot
Users remain free to enter and exit staking
```

This keeps governance simple while preserving user freedom.

---

### 7. User Experience Philosophy

The Olive Branch Network should make staking and governance feel simple.

Users should not need to understand complex formulas, lockup mechanics, or advanced governance systems in order to participate.

The voting system should be easy to explain:

```text
Stake OBN.
Your staked OBN gives you voting power.
The more you stake, the more voting power you have.
Voting power is measured at a snapshot before the vote.
```

This model is simple enough for normal users while still being stronger than one-wallet-one-vote.

---

### 8. Optional Future Staking-Age Requirement

Although the initial model can remain simple, the protocol may consider adding a minimum staking-age requirement in the future.

For example:

```text
Only OBN staked for at least 30 days before the snapshot counts toward voting power.
```

This would help prevent last-minute governance influence without requiring an unstaking cooldown.

However, this should be treated as an optional future upgrade, not a requirement for the first version of DAO voting.

The first version should prioritize clarity, accessibility, and ease of participation.

---

### 9. Applying the Voting System to DAO Decisions

The same voting system can be used across major DAO decisions.

For the Protocol Fund Decision, users would vote with power proportional to their staked OBN at the snapshot.

This voting power can be used to decide questions such as:

```text
Should treasury OBN be burned or transferred to the charityFund?
Which nonprofit should receive the charityFund distribution?
```

In both cases, voting influence comes from staked OBN, not from wallet count.

---

### 10. Core Voting Rules

The OBN voting system can be summarized with the following rules:

1. Voting power is based on staked OBN.
2. One staked OBN equals one unit of voting power.
3. Wallet count does not determine voting power.
4. Voting power is measured at a snapshot before the vote begins.
5. OBN staked after the snapshot does not count for that specific vote.
6. No unstaking cooldown is required at launch.
7. Minimum staking-age requirements may be considered later if needed.

---

### 11. Conclusion

The Olive Branch Network DAO voting system should begin with a simple stake-weighted model.

This model avoids the weaknesses of one-wallet-one-vote, reduces Sybil risk, and keeps governance tied to actual participation in the protocol.

By using staked OBN as the source of voting power, OBN creates a governance system where users have influence proportional to their commitment.

The initial system should avoid unnecessary complexity and preserve the user experience. No unstaking cooldown is needed at launch. Instead, OBN can rely on snapshot-based stake-weighted voting to keep the process fair, understandable, and easy to participate in.

In simple terms:

```text
Voting Power = Staked OBN at Snapshot
```

This gives OBN a clean foundation for DAO governance.
