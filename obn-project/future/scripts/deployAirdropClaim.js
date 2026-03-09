/**
 * Deployment script for OBNAirdropClaim
 *
 * Usage:
 *   npx hardhat run future/scripts/deployAirdropClaim.js --network base
 *
 * Required environment variables:
 *   OBN_TOKEN_ADDRESS   - deployed OBN token proxy address
 *   SIGNER_ADDRESS      - backend signer hot wallet (signs claim payloads)
 *   OWNER_ADDRESS       - multisig that will own the contract
 *   MAX_CLAIMS          - max unique claimants; omit or set "0" for no cap
 *
 * After deploy:
 *   1. Verify the contract on Basescan
 *   2. Transfer OBN tokens to the contract address
 *   3. Call startClaims() from the owner when ready to open
 */

const { ethers } = require("hardhat");

async function main() {
  const tokenAddress = process.env.OBN_TOKEN_ADDRESS;
  const signerAddress = process.env.SIGNER_ADDRESS;
  const ownerAddress  = process.env.OWNER_ADDRESS;
  const maxClaimsEnv  = process.env.MAX_CLAIMS;

  if (!tokenAddress || !signerAddress || !ownerAddress) {
    throw new Error(
      "Missing env vars: OBN_TOKEN_ADDRESS, SIGNER_ADDRESS, OWNER_ADDRESS"
    );
  }

  // Pass "0" or omit MAX_CLAIMS to disable the cap (deploys with type(uint256).max)
  const maxClaims = (!maxClaimsEnv || maxClaimsEnv === "0")
    ? ethers.MaxUint256
    : BigInt(maxClaimsEnv);

  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Network:               Base (chainId ${chainId})`);
  console.log(`OBN token:             ${tokenAddress}`);
  console.log(`Signer:                ${signerAddress}`);
  console.log(`Owner:                 ${ownerAddress}`);
  console.log(`Max claims:            ${maxClaims === ethers.MaxUint256 ? "unlimited" : maxClaims.toString()}`);
  console.log(`Claims open:           Manually via startClaims()`);

  const factory = await ethers.getContractFactory("OBNAirdropClaim");
  const airdrop = await factory.deploy(
    tokenAddress,
    signerAddress,
    ownerAddress,
    maxClaims
  );

  await airdrop.waitForDeployment();

  const address = await airdrop.getAddress();
  console.log(`\nOBNAirdropClaim deployed: ${address}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Verify:      npx hardhat verify --network base ${address} \\`);
  console.log(`                    ${tokenAddress} ${signerAddress} ${ownerAddress} ${maxClaims.toString()}`);
  console.log(`  2. Fund:        Transfer OBN to ${address}`);
  console.log(`  3. Go live:     Call startClaims() from the owner when ready`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
