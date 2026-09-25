const cashTerms: Record<string, string> = {
  stake: "deposit",
  stakes: "deposits",
  staked: "deposited",
  staking: "depositing",
  staker: "depositor",
  stakers: "depositors",
  unstake: "withdraw",
  unstakes: "withdraws",
  unstaked: "withdrawn",
  unstaking: "withdrawing",
};

/** Translate display copy only; contract methods, routes, and data keys stay stable. */
export function formatDisplayText(text: string, cashMode: boolean): string {
  if (!cashMode) return text;
  return text.replace(/\b(?:unstaking|unstaked|unstakes|unstake|staking|stakers|staker|staked|stakes|stake)\b/gi, (word, offset: number) => {
    const nounModifier = word.toLowerCase() === "staking"
      && /^\s+(?:amounts?|history|activity|rewards?|contract|interface|protocol)\b/i.test(text.slice(offset + word.length));
    const replacement = nounModifier ? "deposit" : cashTerms[word.toLowerCase()];
    if (word === word.toUpperCase()) return replacement.toUpperCase();
    return word[0] === word[0].toUpperCase()
      ? replacement[0].toUpperCase() + replacement.slice(1)
      : replacement;
  });
}
