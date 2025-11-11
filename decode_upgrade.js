const data = "0x4f1ef2860000000000000000000000007d8b5e3744e659e954b8b1d608442d680518788400000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000";

// This is a UUPS proxy upgrade call
// Function selector: 0x4f1ef286 = upgradeTo(address newImplementation, bytes calldata data)
console.log("Function selector:", data.slice(0, 10));
console.log("Full data:", data);

// Extract the new implementation address
// After 0x4f1ef286, skip 32 bytes (function params start)
// Bytes 10-74 contain the address parameter (padded to 32 bytes)
const implAddress = "0x" + data.slice(26, 66);
console.log("\nNew implementation address:", implAddress);

// The rest is initialization data
const initData = "0x" + data.slice(130);
console.log("Init data:", initData);
console.log("Init data is empty:", initData === "0x");
