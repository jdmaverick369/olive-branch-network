"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown, ExternalLink, ArrowUpDown, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { getTokens } from "@coinbase/onchainkit/api";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount } from "wagmi";
import {
  Swap,
  SwapAmountInput,
  SwapButton,
  SwapMessage,
  SwapSettings,
  SwapSettingsSlippageDescription,
  SwapSettingsSlippageInput,
  SwapSettingsSlippageTitle,
  SwapToast,
  SwapToggleButton,
} from "@coinbase/onchainkit/swap";
import type { Token } from "@coinbase/onchainkit/token";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);

const ETH_TOKEN: Token = {
  address: "" as Token["address"],
  chainId: CHAIN_ID,
  decimals: 18,
  name: "Ethereum",
  symbol: "ETH",
  image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
};

const USDC_TOKEN: Token = {
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
  chainId: CHAIN_ID,
  decimals: 6,
  name: "USD Coin",
  symbol: "USDC",
  image: "/usdc.svg",
};

/**
 * Hook to override body background to match page gradient bottom color
 */
function usePageBackground() {
  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    // Set body to match --page-bg-to (the bottom of the gradient)
    document.body.style.backgroundColor = "var(--page-bg-to)";

    return () => {
      document.body.style.backgroundColor = originalBg;
    };
  }, []);
}

export default function FAQPage() {
  // Override body background to match page gradient
  usePageBackground();
  const { connector } = useAccount();
  const isBaseAccount = connector?.id === "baseAccount";
  const [swappableTokens, setSwappableTokens] = useState<Token[]>([USDC_TOKEN]);

  useEffect(() => {
    getTokens({ limit: "50" }).then((tokens) => {
      if (Array.isArray(tokens) && tokens.length > 0) setSwappableTokens(tokens);
    }).catch(() => {});
  }, []);

  const theme = useTheme();
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({
    0: true,
  });
  const [isInMiniApp, setIsInMiniApp] = useState(false);

  useEffect(() => {
    sdk.isInMiniApp().then(setIsInMiniApp);
  }, []);

  const toggleItem = (index: number) => {
    setOpenItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const FAQItem = ({
    index,
    question,
    answer,
  }: {
    index: number;
    question: string;
    answer: string | React.ReactNode;
  }) => (
    <div className="border" style={{
      borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
      backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
      boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
    }}>
      <button
        onClick={() => toggleItem(index)}
        className="w-full px-6 py-4 flex items-center justify-between transition-colors bg-transparent"
      >
        <h3
          className="text-lg font-semibold text-left"
          style={{ color: "var(--card-text)" }}
        >
          {question}
        </h3>
        <ChevronDown
          className="w-5 h-5 shrink-0 transition-transform ml-4"
          style={{
            color: "var(--card-text)",
            transform: openItems[index] ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {openItems[index] && (
        <div
          className="px-6 py-4 border-t"
          style={{
            backgroundColor: theme === "dark" ? "var(--page-bg-to)" : "var(--card-bg)",
            borderColor: "var(--card-border)",
            color: "var(--card-subtext)",
          }}
        >
          {answer}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col relative page-bg">
      <main className="main-content px-4 pt-8 pb-6 flex flex-col items-center">
        {/* Hero Section */}
        <div className="w-full max-w-4xl mb-12 text-center">
          <h1 className="text-4xl font-bold mb-2" style={{ color: "var(--card-text)" }}>
            FAQ
          </h1>
          <p style={{ color: "var(--card-subtext)" }}>
            Common questions about Olive Branch Network
          </p>
        </div>

        {/* FAQ Items */}
        <div className="w-full max-w-4xl space-y-3 mb-8">
          <FAQItem
            index={0}
            question="What is Olive Branch Network?"
            answer={
              <>
                <p className="mb-4">
                  The Olive Branch Network is a staking protocol that lets you earn rewards while supporting nonprofit organizations.
                </p>
                <p className="mb-4">
                  By staking $OBN tokens into nonprofit pools, you generate yield that is shared between you and the causes you choose to support.
                </p>
                <p className="mb-4">
                  It&apos;s a new way to grow your crypto while contributing at the same time.
                </p>
                <div className="space-y-2">
                  <div className="px-3 py-2 rounded-lg border shadow-md" style={{ backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5", borderColor: theme === "dark" ? "var(--card-border)" : "#10b981", boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)" }}>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "var(--card-subtext)" }}>OBN Token Contract</p>
                    <a
                      href={isInMiniApp ? undefined : "https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685"}
                      target={isInMiniApp ? undefined : "_blank"}
                      rel="noopener noreferrer"
                      className="text-xs font-mono break-all hover:underline"
                      style={{ color: "var(--color-link)" }}
                      onClick={isInMiniApp ? (e) => { e.preventDefault(); sdk.actions.openUrl("https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685"); } : undefined}
                    >0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685</a>
                  </div>
                  <div className="px-3 py-2 rounded-lg border shadow-md" style={{ backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5", borderColor: theme === "dark" ? "var(--card-border)" : "#10b981", boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)" }}>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "var(--card-subtext)" }}>Staking Contract</p>
                    <a
                      href={isInMiniApp ? undefined : "https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2"}
                      target={isInMiniApp ? undefined : "_blank"}
                      rel="noopener noreferrer"
                      className="text-xs font-mono break-all hover:underline"
                      style={{ color: "var(--color-link)" }}
                      onClick={isInMiniApp ? (e) => { e.preventDefault(); sdk.actions.openUrl("https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2"); } : undefined}
                    >0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2</a>
                  </div>
                </div>
              </>
            }
          />

          <FAQItem
            index={1}
            question="What blockchain is Olive Branch Network on?"
            answer={
              <>
                Olive Branch Network operates on Base, an L2 solution for Ethereum. You&apos;ll need a Base-compatible wallet and $OBN tokens to stake. You can buy or sell OBN with ETH or USDC on the{" "}
                <Link href="/trade" className="font-semibold hover:underline" style={{ color: "#16a34a" }}>
                  Trade OBN
                </Link>{" "}
                page.
              </>
            }
          />

          <FAQItem
            index={2}
            question="How do I start staking?"
            answer={
              <>
                <p className="mb-3">
                  Getting started is simple:
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>
                    Connect a Base-compatible wallet and, if needed, get OBN from the{" "}
                    <Link href="/trade" className="font-semibold hover:underline" style={{ color: "#16a34a" }}>
                      Trade OBN
                    </Link>{" "}
                    page using ETH or USDC
                  </li>
                  <li>Go to the{" "}
                    <Link
                      href="/stake-earn-contribute"
                      className="font-semibold hover:underline"
                      style={{ color: "#16a34a" }}
                    >
                      &quot;Stake, Earn, Contribute&quot;
                    </Link>{" "}page
                  </li>
                  <li>Select a nonprofit pool</li>
                  <li>Enter your staking amount</li>
                  <li>Click Stake</li>
                  <li>Confirm the transaction</li>
                </ol>
              </>
            }
          />

          <FAQItem
            index={3}
            question="What is APY and how is it calculated?"
            answer={
              <>
                <p className="mb-4">
                  APY (Annual Percentage Yield) is the rate at which your staked tokens earn rewards over a year. The APY is global across all pools and follows a declining 10-year schedule:
                </p>
                <div
                  className="p-4 rounded-lg border shadow-md mb-4"
                  style={{
                    backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                    borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                    boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                  }}
                >
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Years 1-2:</span>
                      <span className="font-semibold">10.00% APY</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Years 3-4:</span>
                      <span className="font-semibold">7.50% APY</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Years 5-6:</span>
                      <span className="font-semibold">5.00% APY</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Years 7-8:</span>
                      <span className="font-semibold">2.50% APY</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Years 9-10:</span>
                      <span className="font-semibold">1.25% APY</span>
                    </div>
                  </div>
                </div>
                <h4 className="font-semibold mb-2">How the rewards are split:</h4>
                <p className="mb-3">
                  Each pool&apos;s rewards are split four ways:
                </p>
                <div
                  className="p-4 rounded-lg border shadow-md"
                  style={{
                    backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                    borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                    boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                  }}
                >
                  <div className="space-y-3 text-sm">
                    {[
                      { pct: "88%", label: "to Stakers", desc: "You earn 88% of the pool's emissions", color: "#16a34a" },
                      { pct: "10%", label: "to Nonprofit", desc: "Directly funds the nonprofit you're supporting", color: "#2563eb" },
                      { pct: "1%",  label: "to ExtendOliveBranch", desc: "Accumulates OBN all year, then stakers vote which nonprofit receives it", color: "#a855f7" },
                      { pct: "1%",  label: "to TheOffering", desc: "Accumulates OBN all year, then stakers vote to burn it or add it to ExtendOliveBranch", color: "#6b7280" },
                    ].map(({ pct, label, desc, color }) => (
                      <div key={label} className="flex items-start gap-3">
                        <span
                          className="text-xs font-bold text-white px-2 py-1 rounded shrink-0 mt-0.5"
                          style={{ backgroundColor: color }}
                        >
                          {pct}
                        </span>
                        <div>
                          <p className="font-semibold" style={{ color: "var(--card-text)" }}>{label}</p>
                          <p style={{ color: "var(--card-subtext)" }}>{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <p
                  className="mt-4 text-sm"
                  style={{ color: "var(--card-subtext)" }}
                >
                  This split is the same across all pools, so the APY you earn is equal regardless of which nonprofit you choose to support.
                </p>
              </>
            }
          />

          <FAQItem
            index={4}
            question="What are ExtendOliveBranch, TheOffering, and Annual Governance?"
            answer={
              <>
                <p className="mb-4">
                  With the v9.3 protocol upgrade, the old Treasury and CharityFund mechanisms were removed and replaced with two community-directed contracts. OBN no longer accumulates in a protocol-owned treasury.
                </p>
                <div className="space-y-4 mb-4">
                  <div
                    className="p-4 rounded-lg border shadow-md"
                    style={{
                      backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                      borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                      boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                    }}
                  >
                    <h4 className="font-bold mb-1 text-sm" style={{ color: "#a855f7" }}>🌿 ExtendOliveBranch</h4>
                    <p className="text-sm" style={{ color: "var(--card-subtext)" }}>
                      Receives 1% of all emissions. OBN accumulates here throughout the year. At the end of each annual cycle, stakers vote on which nonprofit receives the full balance.
                    </p>
                  </div>
                  <div
                    className="p-4 rounded-lg border shadow-md"
                    style={{
                      backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                      borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                      boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                    }}
                  >
                    <h4 className="font-bold mb-1 text-sm" style={{ color: "#6b7280" }}>🔥 TheOffering</h4>
                    <p className="text-sm" style={{ color: "var(--card-subtext)" }}>
                      Receives 1% of all emissions. OBN accumulates here throughout the year. At the end of each annual cycle, stakers vote whether those tokens are permanently burned or redirected to ExtendOliveBranch for additional nonprofit funding.
                    </p>
                  </div>
                  <div
                    className="p-4 rounded-lg border shadow-md"
                    style={{
                      backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                      borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                      boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                    }}
                  >
                    <h4 className="font-bold mb-1 text-sm" style={{ color: "#2563eb" }}>🗳️ Annual Governance</h4>
                    <p className="text-sm" style={{ color: "var(--card-subtext)" }}>
                      Once per year, stakers participate in a two-part vote: (1) whether TheOffering is burned or contributed to ExtendOliveBranch, and (2) which nonprofit receives the ExtendOliveBranch balance. Voting power is proportional to the amount of OBN you have staked.
                    </p>
                  </div>
                </div>
                <p className="text-sm" style={{ color: "var(--card-subtext)" }}>
                  The result: 100% of newly minted OBN either goes to stakers, directly to nonprofits, or is permanently removed from circulation. The protocol no longer extracts.
                </p>
              </>
            }
          />

          <FAQItem
            index={5}
            question="What is the minimum staking amount?"
            answer="There is no minimum staking amount. You can stake any amount that works for you and adjust it anytime."
          />

          <FAQItem
            index={6}
            question="Can I unstake my tokens at any time?"
            answer="Yes! You can unstake your tokens whenever you want. Simply go to the pool details page and click the &quot;Unstake&quot; button. Your tokens will be returned to your wallet after the transaction is confirmed. There are no lock-up periods."
          />

          <FAQItem
            index={7}
            question="When and how do I receive my rewards?"
            answer={
              <>
                <p>
                  Rewards accumulate automatically and continuously. You can view your pending rewards on the{" "}
                  <Link
                    href="/profile"
                    className="font-semibold hover:underline"
                    style={{ color: "#16a34a" }}
                  >
                    Profile
                  </Link>{" "}
                  page and individual pool pages. When you&apos;re ready, click the &quot;Claim All&quot; or &quot;Claim&quot; button to withdraw your rewards to your wallet.
                </p>
              </>
            }
          />

          <FAQItem
            index={8}
            question="Can I stake in multiple pools?"
            answer={
              <>
                <p className="mb-3">
                  Yes! You can stake in as many nonprofit pools as you want simultaneously. Each pool has its own staking interface on the Dashboard.
                </p>
                <p>
                  Managing rewards across multiple pools is easy with the{" "}
                  <Link
                    href="/profile"
                    className="font-semibold hover:underline"
                    style={{ color: "#16a34a" }}
                  >
                    Profile
                  </Link>
                  {" "}page, which shows all your active stakes in one place. Use the &quot;Claim All&quot; button to collect pending rewards from all your pools in a single transaction.
                </p>
              </>
            }
          />

          <FAQItem
            index={9}
            question="What is the Olive NFT?"
            answer={
              <>
                {/* NFT Collection Image & Introduction */}
                <div className="w-full mb-6">
                  <Image
                    src="/NFTcollection.png"
                    alt="OliveNFT Collection"
                    width={1200}
                    height={800}
                    className="w-full h-auto mb-4"
                  />
                  <p style={{ color: "var(--card-text)" }} className="text-sm leading-relaxed text-center">
                    OliveNFT is the official digital collectible of the Olive Branch Network. It represents your participation in the ecosystem and visually evolves the longer you stake with it on the platform.
                  </p>
                </div>

                {/* Key Details */}
                <h3 className="text-base font-bold mb-3 text-center" style={{ color: "var(--card-text)" }}>Key Details</h3>
                <div className="flex flex-col gap-2 mb-6">
                  {[
                    { label: "Contract Address", value: "0xB66F67444b09f509D72d832567C2df84Edeb80F8", href: "https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8" },
                    { label: "Max Supply", value: "20,000 NFTs (fixed)" },
                    { label: "Mint Price", value: "0.005 ETH" },
                    { label: "Mint Limit", value: "One per wallet at a time" },
                    { label: "Distribution", value: "Randomized commit-and-reveal system" },
                    { label: "Rarity", value: "125 patterned / 475 solid backgrounds each" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border shadow-md"
                      style={{
                        backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                        borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                        boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                      }}
                    >
                      <p className="text-xs font-semibold mb-1" style={{ color: "var(--card-subtext)" }}>{item.label}</p>
                      {item.href ? (
                        <a
                          href={isInMiniApp ? undefined : item.href}
                          target={isInMiniApp ? undefined : "_blank"}
                          rel="noopener noreferrer"
                          className="font-mono text-xs break-all hover:underline"
                          style={{ color: "var(--color-link)" }}
                          onClick={isInMiniApp ? (e) => { e.preventDefault(); sdk.actions.openUrl(item.href!); } : undefined}
                        >{item.value}</a>
                      ) : (
                        <p className="font-mono text-xs break-all" style={{ color: "var(--card-text)" }}>{item.value}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Visual Evolution */}
                <h3 className="text-base font-bold mb-3 text-center" style={{ color: "var(--card-text)" }}>Visual Evolution Through Staking</h3>
                <p className="text-sm text-center mb-4" style={{ color: "var(--card-subtext)" }}>
                  When you stake with your OliveNFT on the OBN App, its appearance changes over time, reflecting your commitment and activity.
                </p>
                <div className="space-y-3 mb-4">
                  {[
                    { days: "0–30 days", effect: "Standard display", desc: "(no gloss)" },
                    { days: "30–60 days", effect: "Gloss effect", desc: "applied" },
                    { days: "60–90 days", effect: "Gold gloss effect", desc: "premium tier" },
                    { days: "90+ days", effect: "Rainbow gloss effect", desc: "ultimate tier" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border-l-4 shadow-md flex items-start gap-3 ring-1"
                      style={{
                        backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                        borderColor: "#16a34a",
                        boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                      }}
                    >
                      <Zap className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#16a34a" }} />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--card-text)" }}>{item.days}</p>
                        <p className="text-sm" style={{ color: "var(--card-subtext)" }}>{item.effect} {item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 rounded-lg border mb-6" style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)" }}>
                  <p className="text-xs" style={{ color: "var(--card-subtext)" }}>
                    <strong>Note:</strong> These gloss effects are frontend-only visual enhancements. The NFT&apos;s smart contract and metadata remain unchanged — what changes is how your NFT is displayed on your Profile page.
                  </p>
                </div>

                {/* How to Mint */}
                <h3 className="text-base font-bold mb-3 text-center" style={{ color: "var(--card-text)" }}>How to Mint</h3>
                <div
                  className="p-4 rounded-lg border shadow-md mb-6"
                  style={{
                    backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                    borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                    boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                  }}
                >
                  <p className="text-sm mb-3" style={{ color: "var(--card-text)" }}>
                    You can mint your OliveNFT directly from your Profile page inside the OBN App. Once minted, it will:
                  </p>
                  <ul className="space-y-2 ml-2">
                    {[
                      "Appear in your wallet",
                      "Display on your Profile page",
                      "Begin its visual progression as you stake with it over time",
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm" style={{ color: "var(--card-text)" }}>
                        <span className="text-green-600 font-bold">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Why OliveNFT Matters */}
                <h3 className="text-base font-bold mb-3 text-center" style={{ color: "var(--card-text)" }}>Why OliveNFT Matters</h3>
                <div className="grid grid-cols-1 gap-3 mb-6">
                  {[
                    { title: "Identity", desc: "Serves as your unique badge in the Olive Branch Network" },
                    { title: "Progression", desc: "The longer you stake with your OliveNFT, the more exclusive its appearance becomes" },
                    { title: "Scarcity", desc: "With only 20,000 ever available, each NFT is rare and meaningful" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg border shadow-md"
                      style={{
                        backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                        borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                        boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                      }}
                    >
                      <h4 className="font-bold mb-1 text-sm" style={{ color: "var(--card-text)" }}>{item.title}</h4>
                      <p className="text-sm" style={{ color: "var(--card-subtext)" }}>{item.desc}</p>
                    </div>
                  ))}
                </div>

                {/* OpenSea Link */}
                <div
                  className="p-4 rounded-lg border shadow-md text-center"
                  style={{
                    backgroundColor: theme === "dark" ? "var(--card-bg)" : "#ecfdf5",
                    borderColor: theme === "dark" ? "var(--card-border)" : "#10b981",
                    boxShadow: theme === "dark" ? undefined : "0 0 0 1px rgba(16, 185, 129, 0.6)",
                  }}
                >
                  <p className="text-sm mb-3" style={{ color: "var(--card-subtext)" }}>View and trade OliveNFTs on OpenSea</p>
                  <a
                    href={isInMiniApp ? undefined : "https://opensea.io/collection/olivenft-108775106"}
                    target={isInMiniApp ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="inline-block px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:shadow-lg hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: "#2563eb", color: "white", textDecoration: "none" }}
                    onClick={isInMiniApp ? (e) => { e.preventDefault(); sdk.actions.openUrl("https://opensea.io/collection/olivenft-108775106"); } : undefined}
                  >
                    View on OpenSea ↗
                  </a>
                </div>
              </>
            }
          />


          <FAQItem
            index={10}
            question="Are there any fees?"
            answer={
              <>
                <p className="mb-4">
                  You may incur standard Base network gas fees (paid in ETH) when staking, unstaking, or claiming rewards. These fees go to the Base network.
                </p>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--card-text)" }}>
                  Don&apos;t have ETH on Base?
                </p>
                <p className="text-xs mb-3">
                  ETH on Base is required to cover network fees when staking, unstaking, and claiming rewards.
                </p>
                {isInMiniApp ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <a
                      href={undefined}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 cursor-pointer"
                      style={{ backgroundColor: "var(--card-section-bg, var(--card-bg))", border: "1px solid var(--card-border)", color: "var(--card-text)" }}
                      onClick={(e) => { e.preventDefault(); sdk.actions.openUrl("https://bridge.base.org"); }}
                    >
                      Base Bridge <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    <a
                      href={undefined}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 cursor-pointer"
                      style={{ backgroundColor: "var(--card-section-bg, var(--card-bg))", border: "1px solid var(--card-border)", color: "var(--card-text)" }}
                      onClick={async (e) => { e.preventDefault(); try { await sdk.actions.swapToken({ buyToken: `eip155:8453/native` }); } catch {} }}
                    >
                      Swap for ETH <ArrowUpDown className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                ) : isBaseAccount ? (
                  <Swap className="w-full max-w-sm">
                    <SwapSettings>
                      <SwapSettingsSlippageTitle>Max slippage</SwapSettingsSlippageTitle>
                      <SwapSettingsSlippageDescription>
                        Your swap will revert if the price changes by more than this amount.
                      </SwapSettingsSlippageDescription>
                      <SwapSettingsSlippageInput />
                    </SwapSettings>
                    <SwapAmountInput label="Sell" token={USDC_TOKEN} type="from" swappableTokens={swappableTokens} />
                    <SwapToggleButton />
                    <SwapAmountInput label="Buy" token={ETH_TOKEN} type="to" swappableTokens={[ETH_TOKEN]} />
                    <SwapButton />
                    <SwapMessage />
                    <SwapToast />
                  </Swap>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <a
                      href="https://bridge.base.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 cursor-pointer"
                      style={{ backgroundColor: "var(--card-section-bg, var(--card-bg))", border: "1px solid var(--card-border)", color: "var(--card-text)" }}
                    >
                      Base Bridge <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    <a
                      href="https://app.uniswap.org/swap?chain=base&outputCurrency=ETH"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 cursor-pointer"
                      style={{ backgroundColor: "var(--card-section-bg, var(--card-bg))", border: "1px solid var(--card-border)", color: "var(--card-text)" }}
                    >
                      Swap for ETH <ArrowUpDown className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                )}
              </>
            }
          />

          <FAQItem
            index={11}
            question="How do I know my funds are safe?"
            answer={
              <>
                <p>
                  Your funds are held in smart contracts on Base, an L2 solution for Ethereum. The contracts have been designed with security in mind. However, as with all cryptocurrency, please do your own research and only stake what you can afford to lose. For more details on risks and disclaimers, please refer to our{" "}
                  <Link
                    href="/terms-of-service"
                    className="font-semibold hover:underline"
                    style={{ color: "#16a34a" }}
                  >
                    Terms of Service
                  </Link>
                  .
                </p>
              </>
            }
          />

          <FAQItem
            index={12}
            question="What if I have more questions?"
            answer={
              <>
                <p>
                  Join our{" "}
                  <a
                    href={isInMiniApp ? undefined : "https://discord.gg/KfMSCsss2z"}
                    target={isInMiniApp ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="font-semibold hover:underline cursor-pointer"
                    style={{ color: "#0D9921" }}
                    onClick={isInMiniApp ? (e) => { e.preventDefault(); sdk.actions.openUrl("https://discord.gg/KfMSCsss2z"); } : undefined}
                  >
                    Discord community
                  </a>{" "}
                  to ask questions and connect with other stakers.
                </p>
              </>
            }
          />
        </div>

      </main>
    </div>
  );
}
