// sign.js
require('dotenv').config();
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const message = `[basescan.org 06/09/2025 20:40:44] I, hereby verify that I am the owner/creator of the address [0x07e5efcd1b5fae3f461bf913bbee03a10a20c685]`;

(async () => {
  const sig = await wallet.signMessage(message); // personal_sign style
  console.log(sig);
})();
