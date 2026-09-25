// CDP 1.52.0 hides axios network retries and drops retry history from APIError.
// Disable them so a first structured rejection proves this attempt was not sent.
// This internal SDK integration is covered by transport.test.mjs and version-pinned.
export async function disableSubmissionRetries() {
  const { getAxiosInstance } = await import(new URL("./openapi-client/cdpApiClient.js", import.meta.resolve("@coinbase/cdp-sdk")));
  const client = getAxiosInstance();
  if (!client) throw new Error("CDP transport is not initialized");
  client.defaults["axios-retry"] = { retries: 0 };
  return client;
}
