// npx hardhat run scripts/safe_schedule_addPool.js --network base
require("dotenv").config();
const { ethers } = require("hardhat");
const Safe = require("@safe-global/protocol-kit").default;
const { EthersAdapter } = require("@safe-global/protocol-kit");
const fs = require("fs");
const path = require("path");

async function main() {
  const {
    GNOSIS_SAFE_ADDRESS,
    TIMELOCK_ADDR,
    OBN_STAKING_CONTRACT,
    SAFE_OWNER_PK,             // one Safe owner key (not the Safe!)
    MIN_DELAY_SECONDS
  } = process.env;

  const TARGET_PID = process.env.TARGET_PID;
  if (!TARGET_PID) throw new Error("TARGET_PID missing in .env");
  const pid = Number(TARGET_PID);
  if (!Number.isInteger(pid) || pid < 0) throw new Error("TARGET_PID must be a non-negative integer");

  const charity = process.env[`PID_${pid}`];
  if (!charity || !ethers.isAddress(charity)) {
    throw new Error(`PID_${pid} missing/invalid in .env`);
  }

  if (!ethers.isAddress(GNOSIS_SAFE_ADDRESS)) throw new Error("GNOSIS_SAFE_ADDRESS missing/invalid");
  if (!ethers.isAddress(TIMELOCK_ADDR)) throw new Error("TIMELOCK_ADDR missing/invalid");
  if (!ethers.isAddress(OBN_STAKING_CONTRACT)) throw new Error("OBN_STAKING_CONTRACT missing/invalid");
  if (!SAFE_OWNER_PK) throw new Error("SAFE_OWNER_PK (an owner EOA private key) is required");

  const delay = Number(MIN_DELAY_SECONDS || 86400);

  // Build call data: addPool(address)
  const POOL_ABI = ["function addPool(address charityWallet) external"];
  const iface = new ethers.Interface(POOL_ABI);
  const data = iface.encodeFunctionData("addPool", [charity]);

  // Timelock params
  const ZERO32 = "0x" + "0".repeat(64);
  const salt = ethers.hexlify(ethers.randomBytes(32));

  // Encode timelock.schedule(...)
  const TL_ABI = ["function schedule(address,uint256,bytes,bytes32,bytes32,uint256)"];
  const tlIface = new ethers.Interface(TL_ABI);
  const scheduleCalldata = tlIface.encodeFunctionData("schedule", [
    OBN_STAKING_CONTRACT,
    0,
    data,
    ZERO32,
    salt,
    delay
  ]);

  // Set up Safe SDK with a single owner signer (others will co-sign in UI)
  const provider = ethers.provider; // from Hardhat
  const ownerSigner = new ethers.Wallet(SAFE_OWNER_PK, provider);
  const ethAdapter = new EthersAdapter({ ethers, signerOrProvider: ownerSigner });
  const safe = await Safe.create({ ethAdapter, safeAddress: GNOSIS_SAFE_ADDRESS });

  // Create Safe tx that calls Timelock.schedule(...)
  const tx = await safe.createTransaction({
    transactions: [{
      to: TIMELOCK_ADDR,
      value: "0",
      data: scheduleCalldata
    }]
  });

  const txHash = await safe.getTransactionHash(tx);
  const sig = await safe.signTransactionHash(txHash);

  console.log("=== Prepared Safe transaction to schedule addPool ===");
  console.log("Safe            :", GNOSIS_SAFE_ADDRESS);
  console.log("Timelock        :", TIMELOCK_ADDR);
  console.log("Staking target  :", OBN_STAKING_CONTRACT);
  console.log("Charity         :", charity);
  console.log("PID (target)    :", pid);
  console.log("Delay (seconds) :", delay);
  console.log("Salt            :", salt);
  console.log("Data (addPool)  :", data);
  console.log("Tx hash         :", txHash);
  console.log("Signed by owner :", await ownerSigner.getAddress());
  console.log("\nSubmit this tx in the Safe UI for other owners to confirm & execute.");

  // Persist the tuple so the execute script can reuse the same values
  const outPath = path.join(process.cwd(), ".timelock_addPool.json");
  const record = {
    timestamp: new Date().toISOString(),
    timelock: TIMELOCK_ADDR,
    staking: OBN_STAKING_CONTRACT,
    charity,
    pid,
    data,
    predecessor: ZERO32,
    salt,
    delay
  };
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2));
  console.log(`\nSaved execute tuple to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
