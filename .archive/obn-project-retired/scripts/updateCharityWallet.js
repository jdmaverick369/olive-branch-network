require('dotenv').config();

async function main() {
  const hre = require('hardhat');
  const { ethers, network } = hre;

  // ---- ENV ----
  const contractAddr = process.env.OBN_STAKING_CONTRACT;
  const pidStr       = process.env.TARGET_PID;
  const newWallet    = process.env.NEW_WALLET;

  if (!contractAddr) throw new Error('Missing OBN_STAKING_CONTRACT in .env');
  if (!pidStr)       throw new Error('Missing TARGET_PID in .env');
  if (!newWallet)    throw new Error('Missing NEW_WALLET in .env');

  const pid = Number(pidStr);
  if (!Number.isInteger(pid) || pid < 0) throw new Error('TARGET_PID must be a non-negative integer');

  // ethers v5/v6 compatible isAddress helper
  const isAddress = (a) => {
    try {
      return ethers.utils ? ethers.utils.isAddress(a) : ethers.isAddress(a);
    } catch { return false; }
  };

  if (!isAddress(newWallet)) throw new Error('NEW_WALLET is not a valid address');
  if (newWallet === ethers.constants?.AddressZero || newWallet === ethers.ZeroAddress) {
    throw new Error('NEW_WALLET cannot be the zero address');
  }

  // Optional safety: expected old wallet from .env (PID_0, PID_1, ...)
  const expectedOld = process.env[`PID_${pid}`];
  if (expectedOld && !isAddress(expectedOld)) {
    throw new Error(`PID_${pid} in .env is not a valid address`);
  }

  // Get signer (first account = PRIVATE_KEY from hardhat.config.js)
  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  // Use compiled artifact (recommended), or fallback to a minimal ABI
  // If your artifacts are available, this is enough:
  const contract = await ethers.getContractAt('OBNStakingPools', contractAddr, signer);

  // If for some reason the artifact name differs or you prefer a minimal ABI, use:
  // const abi = [
  //   "function owner() view returns (address)",
  //   "function getPoolInfo(uint256) view returns (address,uint256)",
  //   "function updateCharityWallet(uint256,address)"
  // ];
  // const contract = new ethers.Contract(contractAddr, abi, signer);

  const owner = await contract.owner();
  if (owner.toLowerCase() !== signerAddr.toLowerCase()) {
    throw new Error(`Signer ${signerAddr} is not the owner (${owner}).`);
  }

  const [currentWallet, totalStaked] = await contract.getPoolInfo(pid);

  console.log('--- Update Charity Wallet ---');
  console.log(`Network:           ${network.name}`);
  console.log(`Contract:          ${contractAddr}`);
  console.log(`PID:               ${pid}`);
  console.log(`Total Staked:      ${totalStaked.toString()}`);
  console.log(`Current Wallet:    ${currentWallet}`);
  console.log(`New Wallet:        ${newWallet}`);

  if (expectedOld) {
    if (currentWallet.toLowerCase() !== expectedOld.toLowerCase()) {
      throw new Error(
        `On-chain wallet (${currentWallet}) does not match .env PID_${pid} (${expectedOld}). Aborting.`
      );
    }
  }

  if (currentWallet.toLowerCase() === newWallet.toLowerCase()) {
    throw new Error('NEW_WALLET is already set as the current wallet—nothing to change.');
  }

  // Send tx
  const tx = await contract.updateCharityWallet(pid, newWallet);
  console.log(`Submitted tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  // Verify
  const [afterWallet] = await contract.getPoolInfo(pid);
  console.log(`After Wallet:      ${afterWallet}`);
  if (afterWallet.toLowerCase() !== newWallet.toLowerCase()) {
    throw new Error('Post-tx verification failed: wallet not updated.');
  }
  console.log('✅ Update successful.');
}

// Hardhat script entrypoint
main().catch((e) => {
  console.error('❌', e.message || e);
  process.exitCode = 1;
});
