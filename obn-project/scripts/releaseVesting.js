// scripts/release_team_vesting.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const vestingAddress = process.env.TEAM_VESTING_ADDRESS || process.env.TEAM_VESTING_CONTRACT;
  if (!vestingAddress) throw new Error("Missing TEAM_VESTING_ADDRESS/TEAM_VESTING_CONTRACT in .env");

  const [caller] = await ethers.getSigners();
  console.log("Caller:", caller.address);
  console.log("TeamVesting:", vestingAddress);

  const TeamVesting = await ethers.getContractFactory("TeamVesting");
  const vesting = TeamVesting.attach(vestingAddress);

  // Read config
  const tokenAddr = await vesting.token();
  const teamWallet = await vesting.teamWallet();
  const start = await vesting.start();
  const CLIFF = await vesting.CLIFF();
  const DURATION = await vesting.DURATION();

  console.log("token:", tokenAddr);
  console.log("teamWallet:", teamWallet);
  console.log("start:", start.toString());
  console.log("cliffTs:", (start + CLIFF).toString(), "(nothing releasable before this)");
  console.log("endTs:", (start + CLIFF + DURATION).toString());

  // Token instance (minimal ABI)
  const token = new ethers.Contract(
    tokenAddr,
    ["function balanceOf(address) view returns (uint256)"],
    caller
  );

  const balVesting = await token.balanceOf(vestingAddress);
  const balTeam = await token.balanceOf(teamWallet);

  // Vesting math
  const vested = await vesting.vestedAmount();
  const released = await vesting.released();
  const releasable = vested - released;

  const fmt = (x) => ethers.formatUnits(x, 18);

  console.log("balances => vesting:", fmt(balVesting), " team:", fmt(balTeam));
  console.log("vested:", fmt(vested), " released:", fmt(released), " releasable:", fmt(releasable));

  if (releasable === 0n) {
    console.log("Nothing to release right now (likely before cliff or already fully released).");
    return;
  }

  console.log("Sending release()...");
  const tx = await vesting.release();
  console.log("tx:", tx.hash);
  await tx.wait();

  const balTeamAfter = await token.balanceOf(teamWallet);
  console.log("Done. Team new balance:", fmt(balTeamAfter));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
