// Oliver's short answers to the questions on /faq. Each entry names the FAQ question it
// summarizes (scripts/command-parser.test.mjs checks it still exists on the FAQ page), so the
// two cannot silently drift apart. Which topic a message is about is decided in commandParser.ts.

export type FaqTopic =
  | "about" | "chain" | "buy" | "howToStake" | "apy" | "governance" | "nft" | "minimum" | "unstakeAnytime"
  | "rewards" | "autoclaimWhat" | "autoclaimWhen" | "autoclaimHow" | "multiplePools" | "fees" | "safety" | "contact";

export type FaqAnswer = {
  faqQuestion: string;                      // the FAQ entry this summarizes, verbatim
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
    links: [{ label: "Read more in the FAQ", href: "/faq" }],
  },
  governance: {
    faqQuestion: "What are ExtendOliveBranch, TheOffering, and Annual Governance?",
    lines: [
      "ExtendOliveBranch gets 1% of all emissions all year; at the end of each year stakers vote which nonprofit receives it.",
      "TheOffering also gets 1%; stakers vote whether it's burned or added to ExtendOliveBranch.",
      "Annual Governance is that yearly vote. You need an OliveNFT in your voting wallet, and voting power follows how much OBN you have staked.",
    ],
    links: [{ label: "Governance", href: "/governance/extend" }],
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
};
