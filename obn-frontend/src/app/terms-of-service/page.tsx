"use client";

import { useEffect } from "react";
import Link from "next/link";

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

export default function TermsOfServicePage() {
  // Override body background to match page gradient
  usePageBackground();
  return (
    <div className="min-h-screen flex flex-col relative page-bg">
      <main className="main-content px-4 pt-8 pb-6 flex flex-col items-center">
        {/* Hero Section */}
        <div className="w-full max-w-4xl mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2" style={{ color: "var(--card-text)" }}>
            Terms of Service
          </h1>
          <p style={{ color: "var(--card-subtext)" }}>
            Last Updated: November 2025
          </p>
        </div>

        {/* Terms Content */}
        <div className="w-full max-w-4xl space-y-6 mb-8">
          {/* Section 1 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              1. Acceptance of Terms
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              By accessing and using the Olive Branch Network (&quot;OBN&quot;)
              platform, you agree to be bound by these Terms of Service
              (&quot;Terms&quot;). If you do not agree to these Terms, you may
              not use the OBN platform. We reserve the right to modify these
              Terms at any time, and your continued use of the platform
              constitutes acceptance of any changes.
            </p>
          </div>

          {/* Section 2 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              2. Description of Service
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              Olive Branch Network is a decentralized application built on
              Base, an L2 solution for Ethereum. The platform allows users to
              stake $OBN tokens to earn rewards while supporting nonprofit
              organizations. The service is provided &quot;as is&quot; without
              warranties of any kind.
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              Key features include: staking and unstaking tokens, earning
              rewards based on Annual Percentage Yield (APY), minting Olive
              NFTs to represent staking activity, and viewing real-time rewards
              and pool information.
            </p>
          </div>

          {/* Section 3 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              3. Eligibility and Account Requirements
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              To use the OBN platform, you must:
            </p>
            <ul
              className="list-disc list-inside space-y-3 ml-4 text-sm"
              style={{ color: "var(--card-subtext)" }}
            >
              <li>Be at least 18 years of age</li>
              <li>
                Have a compatible Ethereum wallet (e.g., MetaMask, WalletConnect)
              </li>
              <li>
                Comply with all applicable laws and regulations in your
                jurisdiction
              </li>
              <li>
                Not be a resident of a jurisdiction where blockchain staking is
                prohibited
              </li>
              <li>
                Not be subject to sanctions by any government or regulatory
                body
              </li>
            </ul>
          </div>

          {/* Section 4 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              4. Staking and Rewards
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              When you stake tokens on the OBN platform:
            </p>
            <ul
              className="list-disc list-inside space-y-3 ml-4 text-sm"
              style={{ color: "var(--card-subtext)" }}
            >
              <li>
                Your tokens are transferred to smart contracts on Base, an L2
                solution for Ethereum
              </li>
              <li>
                Rewards accrue based on the current APY, which may change over
                time
              </li>
              <li>You can unstake your tokens at any time without penalty</li>
              <li>
                Rewards can be claimed at any time and will be transferred to
                your wallet
              </li>
              <li>APY is subject to change and is not guaranteed</li>
              <li>
                There are no minimum or maximum staking amounts, but all staking
                is subject to applicable blockchain network conditions and gas
                fees
              </li>
            </ul>
          </div>

          {/* Section 5 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              5. Reward Distribution
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              Rewards from each pool are distributed according to the following
              split:
            </p>
            <ul
              className="list-disc list-inside space-y-3 ml-4 text-sm"
              style={{ color: "var(--card-subtext)" }}
            >
              <li>88% to stakers who contributed to the pool</li>
              <li>10% to the nonprofit organization supported by the pool</li>
              <li>1% to ExtendOliveBranch</li>
              <li>1% to TheOffering</li>
            </ul>
            <p
              className="text-sm leading-relaxed mt-4"
              style={{ color: "var(--card-subtext)" }}
            >
              This distribution is the same across all pools. Rewards are
              calculated based on your proportional stake in each pool and the
              current APY schedule.
            </p>
          </div>

          {/* Section 6 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              6. Olive NFT
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              The Olive NFT is an optional collectible that represents your
              staking activity on the OBN platform. Key points:
            </p>
            <ul
              className="list-disc list-inside space-y-3 ml-4 text-sm"
              style={{ color: "var(--card-subtext)" }}
            >
              <li>
                You can only have one Olive NFT per wallet
              </li>
              <li>Mint price is 0.005 ETH</li>
              <li>
                Visual effects on the NFT are frontend-only enhancements and do
                not affect the underlying smart contract
              </li>
              <li>
                The NFT will evolve visually as you maintain your stake over
                time
              </li>
              <li>Maximum supply is capped at 20,000 NFTs</li>
              <li>NFTs can be viewed and traded on secondary markets like OpenSea</li>
            </ul>
          </div>

          {/* Section 7 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              7. Gas Fees and Transaction Costs
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              When using the OBN platform, you may incur Ethereum network fees
              (gas fees) for transactions such as staking, unstaking, claiming
              rewards, and minting NFTs. These fees are paid to Ethereum network
              validators and are not controlled by OBN. You are responsible for
              understanding and accepting these costs before making transactions.
              Gas fees are variable and depend on current network conditions.
            </p>
          </div>

          {/* Section 8 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              8. Risks and Disclaimers
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              You acknowledge and accept the following risks:
            </p>
            <ul
              className="list-disc list-inside space-y-3 ml-4 text-sm"
              style={{ color: "var(--card-subtext)" }}
            >
              <li>
                <strong>Smart Contract Risk:</strong> Ethereum smart contracts
                may contain bugs or vulnerabilities. OBN contracts have been
                designed with security in mind, but we cannot guarantee they are
                completely error-free.
              </li>
              <li>
                <strong>Market Risk:</strong> Cryptocurrency values are highly
                volatile. The value of your staked tokens may increase or
                decrease substantially.
              </li>
              <li>
                <strong>Regulatory Risk:</strong> Cryptocurrency regulations are
                evolving. Your use of OBN may be subject to future regulatory
                changes in your jurisdiction.
              </li>
              <li>
                <strong>Blockchain Risk:</strong> Base (Ethereum&apos;s L2
                solution) or the underlying Ethereum network may experience
                congestion, downtime, or other technical issues.
              </li>
              <li>
                <strong>Loss of Funds:</strong> If you lose access to your wallet
                private keys or seed phrase, you may permanently lose access to
                your staked tokens and rewards.
              </li>
              <li>
                <strong>APY Risk:</strong> Rewards are not guaranteed. APY may
                change at any time and may decrease to zero.
              </li>
            </ul>
          </div>

          {/* Section 9 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              9. No Investment Advice
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              OBN does not provide investment, financial, or legal advice. The
              information provided on our platform is for informational purposes
              only. You should conduct your own research and consult with
              qualified financial and legal advisors before using the OBN
              platform or making any investment decisions. Only stake funds that
              you can afford to lose.
            </p>
          </div>

          {/* Section 10 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              10. Acceptable Use Policy
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              You agree not to:
            </p>
            <ul
              className="list-disc list-inside space-y-3 ml-4 text-sm"
              style={{ color: "var(--card-subtext)" }}
            >
              <li>
                Use OBN for illegal activities or to violate any applicable laws
              </li>
              <li>
                Attempt to gain unauthorized access to OBN systems or smart
                contracts
              </li>
              <li>
                Engage in market manipulation, fraud, or other deceptive
                practices
              </li>
              <li>
                Use automated tools to access the platform without authorization
              </li>
              <li>
                Harass, threaten, or abuse other users or OBN team members
              </li>
              <li>Reverse engineer or attempt to extract OBN source code</li>
              <li>
                Use OBN in jurisdictions where it is prohibited or restricted
              </li>
            </ul>
          </div>

          {/* Section 11 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              11. Limitation of Liability
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              To the fullest extent permitted by law, OBN and its developers,
              operators, and affiliates shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, including
              but not limited to loss of profits, data, or use, even if advised
              of the possibility of such damages. In no event shall OBN&apos;s
              total liability exceed the amount of funds you have staked on the
              platform in the past 12 months.
            </p>
          </div>

          {/* Section 12 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              12. Disclaimer of Warranties
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              OBN is provided &quot;AS IS&quot; without any representations or
              warranties of any kind. We do not warrant that:
            </p>
            <ul
              className="list-disc list-inside space-y-3 ml-4 text-sm mt-4"
              style={{ color: "var(--card-subtext)" }}
            >
              <li>The service will be uninterrupted or error-free</li>
              <li>Your transactions will be processed without delays</li>
              <li>Rewards will accrue at the stated APY</li>
              <li>The platform will be available at all times</li>
              <li>Your funds will be protected from loss or theft</li>
            </ul>
          </div>

          {/* Section 13 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              13. Indemnification
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              You agree to indemnify and hold harmless OBN, its developers,
              operators, and affiliates from any claims, damages, losses, or
              expenses arising out of or related to your use of the platform,
              your violation of these Terms, or your violation of any applicable
              laws or third-party rights.
            </p>
          </div>

          {/* Section 14 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              14. Governing Law
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              These Terms shall be governed by and construed in accordance with
              the laws of the United States, without regard to its conflict of
              law principles. Any disputes arising out of or in connection with
              these Terms or your use of OBN shall be resolved through binding
              arbitration in accordance with the rules of the American
              Arbitration Association, rather than in court.
            </p>
          </div>

          {/* Section 15 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              15. Severability
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              If any provision of these Terms is found to be invalid or
              unenforceable, the remaining provisions shall continue in full
              force and effect. The invalid provision shall be modified to the
              minimum extent necessary to make it valid and enforceable.
            </p>
          </div>

          {/* Section 16 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              16. Entire Agreement
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--card-subtext)" }}
            >
              These Terms of Service, together with any other agreements or
              policies provided by OBN, constitute the entire agreement between
              you and OBN regarding your use of the platform. These Terms
              supersede all prior agreements, understandings, and negotiations
              regarding the subject matter herein.
            </p>
          </div>

          {/* Section 17 */}
          <div>
            <h2
              className="text-base font-semibold mb-3"
              style={{ color: "var(--card-text)" }}
            >
              17. Contact Information
            </h2>
            <p
              className="text-sm leading-relaxed mb-4"
              style={{ color: "var(--card-subtext)" }}
            >
              If you have any questions about these Terms of Service, please
              visit our website at{" "}
              <a
                href="https://olivebranch.network"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold hover:underline"
                style={{ color: "#0D9921" }}
              >
                olivebranch.network
              </a>
              .
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
