// Connectors that relay every wallet request through the wallet's own app on phones: MetaMask's
// mobile SDK deep-links into MetaMask for each request, and WalletConnect forwards requests to the
// paired wallet app. A background wallet_getCapabilities query on page load would bounce the user
// into their wallet on every navigation, so these never get one. Sponsored and batched calls are
// a Base Account / Coinbase Wallet feature, so nothing is lost for these wallets.
const RELAYED_CONNECTORS = new Set(["metaMask", "metaMaskSDK", "io.metamask", "walletConnect"]);

/** Whether it's safe to ask this connector for its capabilities without the user doing anything. */
export function canQueryCapabilities(connectorId: string | undefined) {
  return !!connectorId && !RELAYED_CONNECTORS.has(connectorId);
}
