// Test VotingPowerAdapter against live StakingPools contract
require("dotenv").config();
const { ethers } = require("hardhat");

const STAKING_PROXY = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2";

async function main() {
  console.log("=== Testing VotingPowerAdapter (Simulation) ===\n");

  // Deploy VotingPowerAdapter pointing to live proxy
  console.log("Deploying VotingPowerAdapter...");
  const VotingPowerAdapter = await ethers.getContractFactory("VotingPowerAdapter");
  const adapter = await VotingPowerAdapter.deploy(STAKING_PROXY);
  await adapter.waitForDeployment();

  const adapterAddress = await adapter.getAddress();
  console.log(`✅ VotingPowerAdapter deployed to: ${adapterAddress}`);
  console.log();

  // Test against live contract
  console.log("--- Testing Against Live Contract ---");
  console.log(`Staking Pools: ${STAKING_PROXY}`);
  console.log();

  // Get quorum and threshold
  const quorum = await adapter.getQuorum();
  const threshold = await adapter.getProposalThreshold();

  console.log(`Current Quorum (4%): ${ethers.formatEther(quorum)} OBN`);
  console.log(`Proposal Threshold (0.5%): ${ethers.formatEther(threshold)} OBN`);
  console.log();

  // Test some real addresses (use charity wallets for demonstration)
  const testAddresses = [
    "0x1dc1E67c5292c9E2Cc2f051d36aD58F917BFE4d0", // Charity 1
    "0xed6E9b23E08f63E8B47D4BeCE90Ef07C0FFD9777", // Charity 2
    "0x8f06E7F06D94fEa9a77c1FF1F57E28cB9af9Cbab"  // Charity 3
  ];

  console.log("--- Testing Voting Power for Sample Addresses ---");
  const currentTime = Math.floor(Date.now() / 1000);

  for (const address of testAddresses) {
    try {
      const [totalPower, eligiblePids] = await adapter.getVotingPower(address, currentTime);
      const [, poolCount, meetsMaturity, stakedSince] = await adapter.getVotingPowerDetails(address, currentTime);

      console.log(`Address: ${address}`);
      console.log(`  Voting Power: ${ethers.formatEther(totalPower)} OBN`);
      console.log(`  Eligible Pools: ${eligiblePids.length} pool(s) - [${eligiblePids.join(", ")}]`);
      console.log(`  Meets Maturity: ${meetsMaturity ? "✅ Yes" : "❌ No"}`);

      if (stakedSince > 0) {
        const stakedDate = new Date(Number(stakedSince) * 1000);
        const age = currentTime - Number(stakedSince);
        const ageDays = (age / 86400).toFixed(1);

        console.log(`  Staked Since: ${stakedDate.toLocaleString()}`);
        console.log(`  Age: ${ageDays} days`);
      } else {
        console.log(`  Staked Since: Never staked`);
      }

      console.log();
    } catch (error) {
      console.log(`Address: ${address}`);
      console.log(`  Error: ${error.message}`);
      console.log();
    }
  }

  // Simulate a proposal scenario
  console.log("--- Simulated Proposal Scenario ---");
  console.log("Simulating an 'Add Pool' proposal created NOW");
  console.log();

  const proposalSnapshot = currentTime;
  console.log(`Proposal Snapshot: ${new Date(proposalSnapshot * 1000).toLocaleString()}`);
  console.log(`Quorum Required: ${ethers.formatEther(quorum)} OBN`);
  console.log();

  // Check which charities could vote
  let totalEligibleVotes = 0n;
  let eligibleVoters = 0;

  for (const address of testAddresses) {
    try {
      const [votingPower] = await adapter.getVotingPower(address, proposalSnapshot);
      if (votingPower > 0n) {
        totalEligibleVotes += votingPower;
        eligibleVoters++;
        console.log(`✅ ${address} can vote with ${ethers.formatEther(votingPower)} OBN`);
      } else {
        console.log(`❌ ${address} cannot vote (no maturity or no stake)`);
      }
    } catch (error) {
      console.log(`❌ ${address} error: ${error.message}`);
    }
  }

  console.log();
  console.log(`Total Eligible Voters: ${eligibleVoters}/${testAddresses.length}`);
  console.log(`Total Eligible Votes: ${ethers.formatEther(totalEligibleVotes)} OBN`);

  if (totalEligibleVotes >= quorum) {
    console.log(`✅ Quorum would be MET if all eligible voters participate`);
  } else {
    const needed = quorum - totalEligibleVotes;
    console.log(`❌ Quorum would NOT be met - need ${ethers.formatEther(needed)} more OBN votes`);
  }

  console.log();
  console.log("=== Test Complete ===");
  console.log();
  console.log("Note: This is a simulation using a locally deployed adapter.");
  console.log("The adapter is NOT deployed to mainnet yet.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
