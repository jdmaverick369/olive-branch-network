"use client";

import { getAddress, type Address, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";

const CHAIN_ID = 8453;

async function errorMessage(response: Response, fallback: string) {
  try { return ((await response.json()) as { error?: string }).error || fallback; } catch { return fallback; }
}

/**
 * Makes sure the server has a signed-in session (Sign-In with Ethereum) for this wallet.
 * Signs at most once per session lifetime; signing costs nothing and sends no transaction.
 */
export async function ensureWalletSession(address: Address, signMessage: (message: string) => Promise<Hex>) {
  const current = await fetch("/api/auth/session", { cache: "no-store" });
  if (!current.ok) throw new Error(await errorMessage(current, "Sign-in is unavailable right now."));
  const session = await current.json() as { address?: string | null };
  if (session.address?.toLowerCase() === address.toLowerCase()) return;

  const nonceResponse = await fetch("/api/auth/nonce", { cache: "no-store" });
  if (!nonceResponse.ok) throw new Error(await errorMessage(nonceResponse, "Sign-in is unavailable right now."));
  const { nonce } = await nonceResponse.json() as { nonce: string };

  const issuedAt = new Date();
  const message = createSiweMessage({
    domain: window.location.host,
    address: getAddress(address),
    statement: "Sign in to Olive Branch Network to make card deposits. This is free and does not send a transaction.",
    uri: window.location.origin,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 5 * 60_000),
  });
  const signature = await signMessage(message);

  const verify = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!verify.ok) throw new Error(await errorMessage(verify, "Sign-in failed. Please try again."));
}
