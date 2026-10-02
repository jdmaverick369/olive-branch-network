import type { CreateConnectorFn } from "wagmi";
import type { baseAccount } from "@wagmi/connectors";
import { getAddress } from "viem";

/** Identify the connector independently of RainbowKit's displayed wallet ID. */
export function isBaseAccountConnector(
  connector: { readonly type?: string } | null | undefined,
): boolean {
  return connector?.type === "baseAccount";
}

type BaseAccountConnector = ReturnType<ReturnType<typeof baseAccount>>;

/**
 * Makes Base Account connectors reconnect without a popup. Applies to every Base Account connector in
 * the list (ours and RainbowKit's "Base Account" wallet); other connectors pass through unchanged.
 *
 * @wagmi/connectors 6.2.0 (the last release for wagmi 2) reconnects with `wallet_connect`, which needs
 * Base Account's popup window. On page load there's no click behind it, so the browser blocks the window
 * and Base Account shows "wants to continue in Base Account". Upstream fixed this in @wagmi/connectors 7
 * (wevm/wagmi#4884, wagmi 3 only) by reconnecting from the SDK's saved session with `eth_accounts`; this
 * does the same. Fresh connects still go through Base Account's sign-in window.
 */
export function withBaseAccountReconnect<T extends CreateConnectorFn>(create: T): T {
  return ((config: Parameters<T>[0]) => {
    const created = create(config);
    if (!isBaseAccountConnector(created)) return created;
    const connector = created as unknown as BaseAccountConnector;
    type Connector = typeof connector;
    const { connect, disconnect, onDisconnect } = connector;
    let listeners: {
      accountsChanged: Connector["onAccountsChanged"];
      chainChanged: Connector["onChainChanged"];
      disconnect: Connector["onDisconnect"];
    } | undefined;

    async function removeListeners(self: Connector) {
      if (!listeners) return;
      const provider = await self.getProvider();
      provider.removeListener("accountsChanged", listeners.accountsChanged);
      provider.removeListener("chainChanged", listeners.chainChanged);
      provider.removeListener("disconnect", listeners.disconnect);
      listeners = undefined;
    }

    connector.connect = async function (this: Connector, params) {
      if (!params || !("isReconnecting" in params) || !params.isReconnecting) return connect.call(this, params);
      const provider = await this.getProvider();
      const accounts = ((await provider.request({ method: "eth_accounts" })) as string[]).map((x) => getAddress(x));
      if (accounts.length === 0) throw new Error("Base Account has no saved session to reconnect.");
      if (!listeners) {
        listeners = {
          accountsChanged: this.onAccountsChanged.bind(this),
          chainChanged: this.onChainChanged.bind(this),
          disconnect: this.onDisconnect.bind(this),
        };
        provider.on("accountsChanged", listeners.accountsChanged);
        provider.on("chainChanged", listeners.chainChanged);
        provider.on("disconnect", listeners.disconnect);
      }
      return { accounts, chainId: await this.getChainId() } as Awaited<ReturnType<Connector["connect"]>>;
    } as Connector["connect"];

    connector.disconnect = async function (this: Connector) {
      await removeListeners(this);
      return disconnect.call(this);
    };

    connector.onDisconnect = async function (this: Connector, error) {
      await removeListeners(this);
      return onDisconnect.call(this, error);
    };

    return created;
  }) as T;
}
