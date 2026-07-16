// src/lib/contracts.ts
// Canonical on-chain addresses for OBN protocol contracts.
// Proxy addresses are stable; implementation addresses are informational only.

// ---- Core protocol proxies (unchanged across upgrades) ----
export const STAKING_PROXY   = "0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2" as const;
export const LENS_PROXY      = "0x2ae4df523040c0245a6F84342E4B06850c5bdb9b" as const;
export const ANNUAL_GOV_PROXY = "0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270" as const;

// ---- v9.3 implementation (informational — do not call directly) ----
export const V93_IMPL = "0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E" as const;

// ---- Reward-distribution contracts (updated in v9.3) ----
// Replaces old treasury 0x5C8a0aCfAD4528714076068f71a5ff2Ee06c3718
export const THE_OFFERING     = "0xc75B2a5C7B8F88327D44C223769cFa19cc93E341" as const;
// Replaces old charityFund 0x398fE423a8b4FD9B40CADF8bc72448C95474455F
export const EXTEND_OLIVE_BRANCH = "0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B" as const;

// ---- Tokens ----
export const OBN_TOKEN  = "0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685" as const;
export const OLIVE_NFT  = "0xB66F67444b09f509D72d832567C2df84Edeb80F8" as const;
