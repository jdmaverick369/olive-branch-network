// src/lib/oliveAbi.ts
import type { Abi } from "viem";

export const oliveAbi = [
  {
    type: "function",
    name: "saleActive",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool", name: "" }],
  },
  {
    type: "function",
    name: "MINT_PRICE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex", // requires ERC721Enumerable in your NFT
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string", name: "" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const satisfies Abi;
