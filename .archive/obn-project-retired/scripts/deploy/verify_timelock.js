const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_URL);
  const TIMELOCK = "0x86396526286769ace21982E798Df5eef2389f51c";
  
  // Check if contract exists
  const code = await provider.getCode(TIMELOCK);
  console.log("Contract exists:", code !== "0x");
  console.log("Code length:", code.length);
  
  // Try to get min delay with simple call
  const minDelaySelector = "0xf27a0c92"; // getMinDelay()
  try {
    const result = await provider.call({
      to: TIMELOCK,
      data: minDelaySelector
    });
    console.log("\ngetMinDelay() result:", result);
    console.log("Decoded:", ethers.toNumber(result), "seconds");
  } catch (e) {
    console.log("Failed to call getMinDelay:", e.message);
  }
}

main().catch(console.error);
