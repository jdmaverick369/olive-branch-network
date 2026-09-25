import { parseAbi } from "viem";

export const autoClaimAbi = parseAbi([
  "function autoClaimExecutor() view returns (address)",
  "function autoClaimPreference(address user) view returns (bool enabled, uint256 nonce)",
  "function setAutoClaimEnabled(bool enabled)",
  "function currentAutoClaimMonth() view returns (uint256)",
  "function lastAutoClaimMonth(uint256 pid, address user) view returns (uint256)",
  "function autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)",
]);
