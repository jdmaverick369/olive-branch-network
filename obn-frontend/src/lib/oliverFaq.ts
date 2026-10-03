// Oliver's short answers to the questions on /faq. Each entry names the FAQ question it
// summarizes (scripts/command-parser.test.mjs checks it still exists on the FAQ page), so the
// two cannot silently drift apart. Which topic a message is about is decided in commandParser.ts.

export type FaqTopic =
  | "about" | "chain" | "buy" | "howToStake" | "apy" | "governance" | "nft" | "minimum" | "unstakeAnytime"
  | "rewards" | "autoclaimWhat" | "autoclaimWhen" | "autoclaimHow" | "multiplePools" | "fees" | "safety" | "contact"
  | "emissions" | "recipients" | "selection" | "charityWallets" | "seed" | "charter" | "allocation" | "terms" | "token" | "campaigns";

export type FaqAnswer = {
  faqQuestion?: string;                     // the FAQ entry this summarizes, verbatim, when applicable
  lines: string[];
  links?: { label: string; href: string }[];
  chips?: string[];                         // follow-ups Oliver can do right away
};

export const OBN_TOKEN = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685";
export const STAKING = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";

export const FAQ: Record<FaqTopic, FaqAnswer> = {
  about: {
    faqQuestion: "What is Olive Branch Network?",
    lines: [
      "Olive Branch Network is a staking protocol that lets you earn rewards while supporting nonprofits.",
      "You stake OBN into a nonprofit's pool, and the yield is shared between you and the cause you chose.",
      `OBN token: ${OBN_TOKEN}`,
      `Staking contract: ${STAKING}`,
    ],
    links: [{ label: "Read the FAQ", href: "/faq" }],
    chips: ["how do I start staking?", "what is the APY?"],
  },
  chain: {
    faqQuestion: "What blockchain is Olive Branch Network on?",
    lines: ["Olive Branch Network runs on Base, an Ethereum layer 2. You need a Base-compatible wallet and OBN to stake. You can buy or sell OBN with ETH, USDC or EURC on the Trade page."],
    links: [{ label: "Trade OBN", href: "/trade" }],
  },
  buy: {
    faqQuestion: "What blockchain is Olive Branch Network on?",
    lines: ["You can buy OBN with ETH, USDC or EURC on the Trade OBN page. It's on Base, so you'll need a Base-compatible wallet."],
    links: [{ label: "Trade OBN", href: "/trade" }],
  },
  howToStake: {
    faqQuestion: "How do I start staking?",
    lines: [
      "Getting started:",
      "1. Connect a Base-compatible wallet, and get OBN on the Trade OBN page if you need some.",
      "2. Pick a nonprofit, enter an amount, and confirm in your wallet.",
      "Or just tell me, for example \"stake 1,000 OBN to St Jude\", and I'll set it up for you to confirm.",
    ],
    links: [{ label: "Stake, Earn, Contribute", href: "/stake-earn-contribute" }, { label: "Trade OBN", href: "/trade" }],
    chips: ["stake to St Jude", "list the charities"],
  },
  apy: {
    faqQuestion: "What is APY and how is it calculated?",
    lines: [
      "APY is the yearly rate your staked OBN earns. It's the same in every pool and follows a 10-year schedule:",
      "• Years 1-2: 10%", "• Years 3-4: 7.5%", "• Years 5-6: 5%", "• Years 7-8: 2.5%", "• Years 9-10: 1.25%",
      "Each pool's rewards are split: 88% to stakers, 10% to the nonprofit, 1% to ExtendOliveBranch and 1% to TheOffering.",
    ],
    links: [{ label: "Current pool rates", href: "/stake-earn-contribute" }, { label: "Read more in the FAQ", href: "/faq" }],
  },
  governance: {
    faqQuestion: "What are ExtendOliveBranch, TheOffering, and Annual Governance?",
    lines: [
      "ExtendOliveBranch gets 1% of all emissions all year; at the end of each year stakers vote which nonprofit receives it.",
      "TheOffering also gets 1%; stakers vote whether it's burned or added to ExtendOliveBranch.",
      "Annual Governance is that yearly vote. You need an OliveNFT in your voting wallet, and voting power follows how much OBN you have staked.",
    ],
    links: [{ label: "Protocol Funds", href: "/protocol-funds" }],
  },
  nft: {
    faqQuestion: "What is the Olive NFT?",
    lines: [
      "OliveNFT is the network's collectible and your governance identity: you'll need one to vote in Annual Governance.",
      "20,000 max supply, 0.005 ETH to mint, one per wallet at a time. Mint it from your Profile page.",
      "Staked with it, its look evolves: gloss after 30 days, gold after 60, rainbow after 90.",
    ],
    links: [{ label: "Profile", href: "/profile" }, { label: "OpenSea", href: "https://opensea.io/collection/olivenft-108775106" }],
  },
  minimum: {
    faqQuestion: "What is the minimum staking amount?",
    lines: ["There's no minimum. Stake any amount you like and change it anytime."],
    chips: ["stake to St Jude"],
  },
  unstakeAnytime: {
    faqQuestion: "Can I unstake my tokens at any time?",
    lines: ["Yes. There's no lock-up period: you can unstake whenever you want, and the OBN returns to your wallet once the transaction confirms."],
    chips: ["what am I staking?"],
  },
  rewards: {
    faqQuestion: "When and how do I receive my rewards?",
    lines: [
      "Rewards build up continuously. You can see them on your Profile or any pool page, and claim them whenever you like.",
      "You can also turn on sponsored monthly auto-claim so they're collected for you.",
    ],
    chips: ["what am I staking?", "claim all", "turn on auto claim"],
  },
  autoclaimWhat: {
    faqQuestion: "What is sponsored monthly autoclaim?",
    lines: [
      "Sponsored monthly auto-claim collects your pending rewards for you each month, and OBN pays the network fees.",
      "It covers all your nonprofit pools. Rewards are split as usual (88% to you, 10% to the nonprofit, 1% each to ExtendOliveBranch and TheOffering). It never moves your staked OBN or re-stakes your rewards.",
    ],
    chips: ["is auto claim on?", "turn on auto claim"],
  },
  autoclaimWhen: {
    faqQuestion: "When does autoclaim run, and can I still claim manually?",
    lines: [
      "Auto-claim runs on the 14th of each month (UTC). Only pools with rewards are included, once per month.",
      "If you opt in after that day's run, your first claim is the next month. You can still claim manually anytime.",
    ],
    chips: ["is auto claim on?"],
  },
  autoclaimHow: {
    faqQuestion: "How do I turn monthly autoclaim on or off?",
    lines: ["I can do that for you, or you can use the Auto button on your Profile. Either way you confirm it in your wallet, and you can turn it off anytime."],
    chips: ["turn on auto claim", "turn off auto claim"],
  },
  multiplePools: {
    faqQuestion: "Can I stake in multiple pools?",
    lines: ["Yes, stake with as many nonprofits as you like. Your Profile shows them all in one place, and \"claim all\" collects every pool's rewards together."],
    chips: ["what am I staking?", "list the charities"],
  },
  fees: {
    faqQuestion: "Are there any fees?",
    lines: [
      "You may pay standard Base network gas fees (in ETH) to stake, unstake, claim manually or change your auto-claim setting, unless your wallet sponsors it. Those fees go to the Base network.",
      "OBN pays the gas for sponsored monthly auto-claims. Need ETH on Base? Use the Base bridge, or swap for ETH on the Trade page.",
    ],
    links: [{ label: "Swap for ETH", href: "/trade?buy=ETH" }, { label: "Base Bridge", href: "https://bridge.base.org" }],
  },
  safety: {
    faqQuestion: "How do I know my funds are safe?",
    lines: [
      "Your OBN is held in smart contracts on Base, designed with security in mind.",
      "As with any crypto, do your own research and only stake what you can afford to lose. The Terms of Service cover the risks.",
    ],
    links: [{ label: "Terms of Service", href: "/terms-of-service" }],
  },
  contact: {
    faqQuestion: "What if I have more questions?",
    lines: ["Join the Discord community to ask questions and connect with other stakers."],
    links: [{ label: "Discord", href: "https://discord.gg/KfMSCsss2z" }, { label: "FAQ", href: "/faq" }],
  },
  // Source: WHITEPAPER.md §§3.2, 4.1, 11; THESIS.md §4.3. Triggers/synonyms: FAQ_PATTERNS.emissions.
  emissions: {
    lines: ["Rewards come from new OBN tokens issued by the staking contract under its emission schedule. They build up with the amount and time staked and are distributed when rewards are settled. They are not interest from lending your stake, and their money value depends on OBN's market price."],
    links: [{ label: "Current pool rates", href: "/stake-earn-contribute" }],
    chips: ["how are rewards divided?"],
  },
  // Source: WHITEPAPER.md §5.1; terms-of-service/page.tsx §5; FAQ reward split.
  recipients: {
    faqQuestion: "What is APY and how is it calculated?",
    lines: ["Of each settled reward, 88% goes to the staker, 10% to the chosen nonprofit, and 1% each to ExtendOliveBranch and TheOffering. These shares come from rewards, not a contribution of your staked principal. The same split applies across pools."],
    links: [{ label: "Protocol Funds", href: "/protocol-funds" }],
  },
  // Source: WHITEPAPER.md §§6.2, 6.4, 7.2; docs/commentary/COMMENTARY.md Article IV.
  selection: {
    lines: ["OBN lists nonprofit pools using independently checkable organization and wallet information; listing does not imply endorsement or affiliation. Authorized protocol governance manages pool additions and removals. Closing a pool to new stakes still allows existing users to claim and withdraw; removal requires an empty pool."],
    links: [{ label: "Nonprofits and verification links", href: "/stake-earn-contribute" }],
  },
  // Source: WHITEPAPER.md §§5.1, 6.1–6.2; pools.ts verification links.
  charityWallets: {
    lines: ["Each nonprofit pool has a designated charity wallet. When rewards are settled, the contract sends the nonprofit's share directly to that wallet in OBN. A pool's page shows its wallet and available verification links; OBN does not automatically convert those tokens to cash."],
    links: [{ label: "View nonprofit pools", href: "/stake-earn-contribute" }],
  },
  // Source: WHITEPAPER.md §§5.2–5.3, 6.3. Community Seed implementation is not established as public/live.
  seed: {
    lines: ["The Charity Genesis Reserve is an initial token allocation intended to help approved nonprofits start earning through permanently locked bootstrap stakes. That locked principal differs from an ordinary user's withdrawable stake. I can't confirm a live community seed pool from the public app; check the FAQ or ask the team about availability."],
    links: [{ label: "FAQ", href: "/faq" }],
  },
  // Source: docs/charter/CHARTER.md Articles I–X; docs/README.md Publication status; AUTHORITY-TAXONOMY.md.
  charter: {
    lines: ["OBN's published draft Charter describes voluntary participation, control of principal, accountable recipients, and publicly checkable contributions and decisions. It is frozen at draft v0.1 pending validation, rather than a claim that every proposed rule is live. Participants decide the annual protocol-fund outcomes; authorized operators currently manage recipient eligibility and administration."],
    links: [{ label: "Protocol Funds", href: "/protocol-funds" }, { label: "Public Charter", href: "https://github.com/jdmaverick369/olive-branch-network/blob/main/docs/charter/CHARTER.md" }],
  },
  // Source: WHITEPAPER.md §§3.4–3.6; protocol-funds/page.tsx. Avoid disputed full-balance/cutoff details.
  allocation: {
    lines: ["TheOffering and ExtendOliveBranch receive separate shares of staking rewards. Annual governance decides whether TheOffering's allocation is burned or added to ExtendOliveBranch, then selects a nonprofit for the distribution. The public Protocol Funds page shows balances and voting status; I don't have a verified answer here for a specific cycle's final allocation."],
    links: [{ label: "Protocol Funds", href: "/protocol-funds" }],
  },
  // Source: terms-of-service/page.tsx §§8–9; WHITEPAPER.md §6.4. No individualized tax advice.
  terms: {
    lines: ["OBN does not provide investment, financial, or legal advice, and rewards are not guaranteed. Staking and an onchain contribution record are not a donation receipt or a promise of tax deductibility. Smart-contract, market, network and wallet-access risks remain; consult qualified advisors about your circumstances."],
    links: [{ label: "Terms of Service", href: "/terms-of-service" }],
  },
  // Source: WHITEPAPER.md §§3.1, 11; FAQ 'What is Olive Branch Network?' (public token address).
  token: {
    faqQuestion: "What is Olive Branch Network?",
    lines: [`OBN is the Olive Branch Network token on Base: ${OBN_TOKEN}. Supply changes as staking rewards are minted and tokens are burned, so an initial supply figure is not today's total. Use the token explorer for current supply and the Trade page to acquire OBN.`],
    links: [{ label: "OBN token and supply", href: `https://basescan.org/token/${OBN_TOKEN}` }, { label: "Trade OBN", href: "/trade" }],
  },
  // Source: README.md 'How It Works'; WHITEPAPER.md §10. Campaign prototypes are not public feature evidence.
  campaigns: {
    lines: ["I don't have a verified public answer about a specific campaign or its availability. The supported flow here is to choose a nonprofit pool, review your stake, and sign in your wallet. Check the FAQ or ask the team about campaign details."],
    links: [{ label: "FAQ", href: "/faq" }, { label: "Nonprofit pools", href: "/stake-earn-contribute" }],
  },
};
