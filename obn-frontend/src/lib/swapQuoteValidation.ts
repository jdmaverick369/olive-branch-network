import { isAddress, isHex, parseAbi, zeroAddress, type Address, type Hex } from "viem";

// Official immutable targets and deployment registry, not a pinned Settler:
// https://docs.0x.org/docs/core-concepts/contracts
// https://github.com/0xProject/0x-settler#settler-contract-addresses
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
export const BASE_ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734" as const;
export const SETTLER_REGISTRY = "0x00000000000004533Fe15556B1E086BB1A72cEae" as const;
export const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;
const registryAbi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)", "function prev(uint128 featureId) view returns (address)"]);
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const uint = (value: unknown) => {
  if ((typeof value !== "string" || !/^\d+$/.test(value)) && typeof value !== "bigint" && !(typeof value === "number" && Number.isSafeInteger(value))) throw new Error("The swap quote contains an invalid amount.");
  const number = BigInt(value as string | number | bigint);
  if (number < 0n || number >= 2n ** 256n) throw new Error("The swap quote contains an invalid amount.");
  return number;
};
type Fields = ReadonlyArray<{ name: string; type: string }>;
const permitTypes = {
  TokenPermissions: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }],
  PermitTransferFrom: [{ name: "permitted", type: "TokenPermissions" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
  EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
} as const;
const fieldsMatch = (actual: unknown, expected: Fields) => Array.isArray(actual) && actual.length === expected.length && actual.every((field, index) => field?.name === expected[index].name && field?.type === expected[index].type);
export type ExecutableSwapQuote = {
  fromToken?: string; toToken?: string; fromAmount?: string; toAmount?: string; minToAmount?: string;
  taker?: string; issues?: { allowance?: { spender: string } };
  transaction?: { to: Address; data: Hex; value: string };
  permit2?: { eip712: unknown } | null;
};
export type SwapIntent = { chainId: number; account: Address; fromToken: Address; toToken: Address; fromAmount: bigint };

/** Validate signing authority before either approval or signature, then again before submission. */
export function validateSwapQuote(quote: ExecutableSwapQuote, intent: SwapIntent, now = Math.floor(Date.now() / 1000)) {
  if (intent.chainId !== 8453) throw new Error("Swaps are currently supported on Base only.");
  if (!same(quote.fromToken, intent.fromToken) || !same(quote.toToken, intent.toToken)
    || uint(quote.fromAmount) !== intent.fromAmount || intent.fromAmount <= 0n
    || (quote.taker !== undefined && !same(quote.taker, intent.account))) throw new Error("The returned quote did not match the requested trade.");
  if (uint(quote.toAmount) <= 0n || uint(quote.minToAmount) <= 0n || uint(quote.minToAmount) > uint(quote.toAmount)) throw new Error("The quote has no valid minimum received amount.");
  const transaction = quote.transaction;
  if (!transaction || !isAddress(transaction.to) || same(transaction.to, zeroAddress) || !isHex(transaction.data, { strict: true })
    || transaction.data.length < 10 || transaction.data.length % 2 !== 0) throw new Error("The swap provider returned invalid transaction data.");
  const native = same(intent.fromToken, NATIVE_TOKEN);
  if (uint(transaction.value) !== (native ? intent.fromAmount : 0n)) throw new Error("The swap transaction requests an unexpected ETH amount.");
  const allowance = quote.issues?.allowance;
  if (allowance && (native || (!same(allowance.spender, PERMIT2) && !same(allowance.spender, BASE_ALLOWANCE_HOLDER)))) throw new Error("The quote requests approval for an unsupported spender.");
  if (quote.permit2) {
    if (native || (allowance && !same(allowance.spender, PERMIT2)) || same(transaction.to, BASE_ALLOWANCE_HOLDER)) throw new Error("The quote mixes incompatible swap permissions.");
    const typed = quote.permit2.eip712 as {
      domain?: { name?: unknown; chainId?: unknown; verifyingContract?: unknown; version?: unknown; salt?: unknown };
      types?: Record<string, unknown>; primaryType?: unknown;
      message?: { permitted?: { token?: unknown; amount?: unknown }; spender?: unknown; nonce?: unknown; deadline?: unknown };
    } | null;
    if (!typed || typed.primaryType !== "PermitTransferFrom" || typed.domain?.name !== "Permit2"
      || uint(typed.domain.chainId) !== BigInt(intent.chainId) || !same(typed.domain.verifyingContract, PERMIT2)
      || typed.domain.version !== undefined || typed.domain.salt !== undefined
      || !fieldsMatch(typed.types?.TokenPermissions, permitTypes.TokenPermissions)
      || !fieldsMatch(typed.types?.PermitTransferFrom, permitTypes.PermitTransferFrom)
      || (typed.types?.EIP712Domain !== undefined && !fieldsMatch(typed.types.EIP712Domain, permitTypes.EIP712Domain))
      || Object.keys(typed.types ?? {}).some(key => !(key in permitTypes))
      || !same(typed.message?.permitted?.token, intent.fromToken)
      || uint(typed.message?.permitted?.amount) !== intent.fromAmount
      || !same(typed.message?.spender, transaction.to)
      || uint(typed.message?.deadline) <= BigInt(now)) throw new Error("The swap permit does not match this wallet's requested trade.");
    uint(typed.message?.nonce);
  } else if (!native && !same(transaction.to, BASE_ALLOWANCE_HOLDER)) {
    throw new Error("The token swap did not include its required Permit2 signature.");
  }
  if (allowance && same(allowance.spender, BASE_ALLOWANCE_HOLDER) && !same(transaction.to, BASE_ALLOWANCE_HOLDER)) throw new Error("The quote's approval target does not match its swap route.");
}

/** Accept current and previous deployments during the documented 0x API dwell period.
 * A paused/reverting registry must fail closed, including when the previous address matches.
 */
export async function validateSwapRouter(quote: ExecutableSwapQuote, readRegistry: (functionName: "ownerOf" | "prev") => Promise<Address>) {
  if (!quote.transaction) throw new Error("Missing swap transaction.");
  if (same(quote.transaction.to, BASE_ALLOWANCE_HOLDER)) return;
  const current = await readRegistry("ownerOf");
  if (same(current, zeroAddress)) throw new Error("The swap router is paused.");
  if (same(quote.transaction.to, current)) return;
  const previous = await readRegistry("prev");
  if (!same(quote.transaction.to, previous) || same(previous, zeroAddress)) throw new Error("The swap transaction targets an unrecognized router.");
}
export const swapRegistryRead = (functionName: "ownerOf" | "prev") => ({ address: SETTLER_REGISTRY, abi: registryAbi, functionName, args: [2n] as const });
