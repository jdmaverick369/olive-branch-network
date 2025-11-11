// Check the source of charity stakes - bootstrap vs self-stake
require("dotenv").config();
const { ethers } = require("hardhat");

const ABI = [
  "function poolLength() view returns (uint256)",
  "function getPoolInfo(uint256 pid) view returns (address charityWallet, uint256 totalStaked)",
  "function userAmount(uint256, address) view returns (uint256)",
  "function lockedAmount(uint256, address) view returns (uint256)",
  "function charityFund() view returns (address)"
];

async function main() {
  const STAKING_PROXY = process.env.OBN_STAKING_CONTRACT || "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";

  console.log("=== Analyzing Charity Bootstrap Stakes ===\n");

  const staking = await ethers.getContractAt(ABI, STAKING_PROXY);

  const charityFundAddress = await staking.charityFund();
  console.log("Charity Fund Address:", charityFundAddress);
  console.log();

  const poolLength = await staking.poolLength();

  for (let pid = 0; pid < poolLength; pid++) {
    const poolData = await staking.getPoolInfo(pid);
    const charityWallet = poolData.charityWallet || poolData[0];

    const charityTotalStaked = await staking.userAmount(pid, charityWallet);
    const charityLocked = await staking.lockedAmount(pid, charityWallet);
    const charityUnlocked = charityTotalStaked - charityLocked;

    console.log(`Pool ${pid}:`);
    console.log(`  Charity Wallet: ${charityWallet}`);
    console.log(`  Total Staked: ${ethers.formatEther(charityTotalStaked)} OBN`);
    console.log(`  Locked: ${ethers.formatEther(charityLocked)} OBN`);
    console.log(`  Unlocked: ${ethers.formatEther(charityUnlocked)} OBN`);

    if (charityUnlocked > 0n) {
      console.log(`  ⚠️  ISSUE: Charity has ${ethers.formatEther(charityUnlocked)} OBN UNLOCKED`);
      console.log(`      This should NOT exist - only locked bootstrap is allowed!`);
    }

    if (charityLocked !== 1000000n * 10n**18n) {
      console.log(`  ⚠️  ISSUE: Locked amount is ${ethers.formatEther(charityLocked)} OBN`);
      console.log(`      Expected: 1000000.0 OBN (bootstrap from charity fund)`);
    }

    console.log();
  }

  console.log("=====================================");
  console.log("Expected behavior:");
  console.log("- Each charity should have 1,000,000 OBN LOCKED (bootstrap)");
  console.log("- Each charity should have 0 OBN UNLOCKED (no self-stakes)");
  console.log("- Bootstrap was deposited BY charityFund ON BEHALF OF charity");
  console.log("=====================================");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
