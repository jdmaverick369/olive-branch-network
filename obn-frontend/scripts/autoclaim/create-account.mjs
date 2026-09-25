// Run explicitly once when commissioning the service. Creates CDP accounts;
// does not grant permissions, deploy OBN contracts, or submit transactions.
import { CdpClient } from "@coinbase/cdp-sdk";

async function main() {
  for (const key of ["AUTOCLAIM_CDP_API_KEY_ID", "AUTOCLAIM_CDP_API_KEY_SECRET", "AUTOCLAIM_CDP_WALLET_SECRET"]) {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  }
  const cdp = new CdpClient({ apiKeyId: process.env.AUTOCLAIM_CDP_API_KEY_ID,
    apiKeySecret: process.env.AUTOCLAIM_CDP_API_KEY_SECRET, walletSecret: process.env.AUTOCLAIM_CDP_WALLET_SECRET });
  const owner = await cdp.evm.getOrCreateAccount({ name: "obn-autoclaim-owner" });
  const smart = await cdp.evm.getOrCreateSmartAccount({ name: "obn-autoclaim", owner });
  console.log(`AUTOCLAIM_OWNER=${owner.address}\nAUTOCLAIM_EXECUTOR=${smart.address}`);
}
main().catch(() => { console.error("Account setup failed. Check the dedicated CDP credentials."); process.exitCode = 1; });
