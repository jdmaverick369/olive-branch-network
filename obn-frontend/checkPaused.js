const { ethers } = require('ethers');
const stakingAbi = require('./src/lib/stakingAbi.json'); // export your ABI as JSON

// 🔧 Replace with your deployed addresses and RPC
const STAKING_CONTRACT = '0x4A47d0B2046476fE46E2F1B4c28264851BdE500f';
const RPC = 'https://sepolia.base.org'; // Base Sepolia endpoint

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const staking = new ethers.Contract(STAKING_CONTRACT, stakingAbi, provider);

  const paused = await staking.paused();
  console.log('✅ paused =', paused);
}

main().catch(console.error);
