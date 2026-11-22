// Local regression check only. Receiver is a minimal custody test fixture, not a governance vault.
const assert = require('node:assert/strict');
const { ethers, network } = require('hardhat');
const solc = require('solc');
const nftArtifact = require('../../../artifacts/contracts/OliveNFT.sol/OliveNFT.json');
const source = `pragma solidity ^0.8.20;
interface NFT { function safeTransferFrom(address,address,uint256) external; }
contract Receiver {
    address public immutable nft;
    mapping(uint256 => address) public depositor;
    constructor(address collection) { nft = collection; }
    function onERC721Received(address,address from,uint256 id,bytes calldata) external returns(bytes4) {
        require(msg.sender == nft);
        depositor[id] = from;
        return this.onERC721Received.selector;
    }
    function withdraw(uint256 id) external {
        require(depositor[id] == msg.sender);
        delete depositor[id];
        NFT(nft).safeTransferFrom(address(this), msg.sender, id);
    }
}`;
async function main() {
  assert.equal(network.name, 'hardhat');
  const [holder] = await ethers.getSigners();
  const nft = await new ethers.ContractFactory(nftArtifact.abi, nftArtifact.bytecode, holder).deploy('Olive', 'OLIVE', '');
  await nft.waitForDeployment();
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Receiver.sol': { content: source } }, settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
  const compiled = output.contracts['Receiver.sol'].Receiver;
  const receiver = await new ethers.ContractFactory(compiled.abi, compiled.evm.bytecode.object, holder).deploy(await nft.getAddress());
  await receiver.waitForDeployment();
  assert.equal(await nft.enforceOnePerAddress(), true);
  await (await nft.setSaleActive(true)).wait();
  const value = await nft.MINT_PRICE();
  const alreadyHolding = e => String(e.message).includes(nft.interface.getError('AlreadyHolding').selector) || String(e.message).includes('AlreadyHolding');
  await (await nft.mint({ value })).wait();
  await assert.rejects(nft.mint({ value }), alreadyHolding);
  await (await nft['safeTransferFrom(address,address,uint256)'](holder.address, await receiver.getAddress(), 1)).wait();
  assert.equal(await nft.balanceOf(holder.address), 0n);
  await (await nft.mint({ value })).wait();
  assert.equal(await nft.balanceOf(holder.address), 1n);
  await (await receiver.withdraw(1)).wait();
  assert.equal(await nft.balanceOf(holder.address), 2n);
  assert.equal(await nft.ownerOf(1), holder.address);
  assert.equal(await nft.ownerOf(2), holder.address);
  await assert.rejects(nft.mint({ value }), alreadyHolding);
  console.log('PASS: mint #1 -> deposit #1 -> mint #2 -> withdraw #1. Wallet holds both NFTs with enforceOnePerAddress=true. Public mint remains blocked while wallet holds an NFT.');
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exitCode = 1; });
