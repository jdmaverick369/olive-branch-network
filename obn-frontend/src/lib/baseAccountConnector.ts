/** Identify the connector independently of RainbowKit's displayed wallet ID. */
export function isBaseAccountConnector(
  connector: { readonly type?: string } | null | undefined,
): boolean {
  return connector?.type === "baseAccount";
}
