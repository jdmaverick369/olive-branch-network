const { expect }  = require("chai");
const { ethers }  = require("hardhat");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function deployMockToken(owner) {
  const factory = await ethers.getContractFactory("MockERC20", owner);
  return factory.deploy("OBN", "OBN", 18);
}

async function buildDomain(contract) {
  const { chainId } = await ethers.provider.getNetwork();
  return {
    name:              "OBNAirdropClaim",
    version:           "1",
    chainId:           Number(chainId),
    verifyingContract: await contract.getAddress(),
  };
}

const CLAIM_TYPES = {
  Claim: [
    { name: "recipient", type: "address" },
    { name: "amount",    type: "uint256" },
    { name: "nonce",     type: "uint256" },
  ],
};

async function signClaim(signerWallet, contract, recipient, amount, nonce) {
  const domain = await buildDomain(contract);
  return signerWallet.signTypedData(domain, CLAIM_TYPES, { recipient, amount, nonce });
}

const AMOUNT     = ethers.parseEther("1000");
const NONCE      = 1n;
const MAX_CLAIMS = 100n;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OBNAirdropClaim", function () {
  let token, airdrop;
  let owner, backend, alice, bob;

  beforeEach(async function () {
    [owner, backend, alice, bob] = await ethers.getSigners();
    token = await deployMockToken(owner);

    const factory = await ethers.getContractFactory("OBNAirdropClaim", owner);
    airdrop = await factory.deploy(
      await token.getAddress(),
      backend.address,
      owner.address,
      MAX_CLAIMS
    );

    await token.mint(await airdrop.getAddress(), ethers.parseEther("1000000"));
  });

  // ---- campaign not started ------------------------------------------------

  it("reverts with ClaimNotStarted before startClaims() is called", async function () {
    const signature = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, signature))
      .to.be.revertedWithCustomError(airdrop, "ClaimNotStarted");
  });

  it("startClaims() sets claimsLive = true and emits ClaimsStarted", async function () {
    expect(await airdrop.claimsLive()).to.be.false;
    await expect(airdrop.connect(owner).startClaims())
      .to.emit(airdrop, "ClaimsStarted");
    expect(await airdrop.claimsLive()).to.be.true;
  });

  it("only owner can call startClaims()", async function () {
    await expect(airdrop.connect(alice).startClaims())
      .to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
  });

  it("reverts with ClaimsAlreadyStarted if startClaims() is called twice", async function () {
    await airdrop.connect(owner).startClaims();
    await expect(airdrop.connect(owner).startClaims())
      .to.be.revertedWithCustomError(airdrop, "ClaimsAlreadyStarted");
  });

  // ---- happy path ----------------------------------------------------------

  it("allows a valid claim once live", async function () {
    await airdrop.connect(owner).startClaims();
    const signature = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);

    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, signature))
      .to.emit(airdrop, "Claimed")
      .withArgs(alice.address, AMOUNT, NONCE, 1n);

    expect(await token.balanceOf(alice.address)).to.equal(AMOUNT);
    expect(await airdrop.hasClaimed(alice.address)).to.be.true;
    expect(await airdrop.totalClaims()).to.equal(1n);
    expect(await airdrop.remainingClaims()).to.equal(MAX_CLAIMS - 1n);
  });

  // ---- hasClaimed (double-claim) -------------------------------------------

  it("rejects a second claim from the same wallet", async function () {
    await airdrop.connect(owner).startClaims();
    const sig1 = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await airdrop.connect(alice).claim(AMOUNT, NONCE, sig1);

    const sig2 = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE + 1n);
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE + 1n, sig2))
      .to.be.revertedWithCustomError(airdrop, "AlreadyClaimed");
  });

  // ---- usedDigests ---------------------------------------------------------

  it("marks the digest as used on successful claim", async function () {
    await airdrop.connect(owner).startClaims();
    const signature = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await airdrop.connect(alice).claim(AMOUNT, NONCE, signature);

    const digest = await airdrop.getClaimDigest(alice.address, AMOUNT, NONCE);
    expect(await airdrop.usedDigests(digest)).to.be.true;
  });

  it("DigestAlreadyUsed fires if hasClaimed is somehow bypassed (guard is independent)", async function () {
    // We cannot directly bypass hasClaimed, but we can verify usedDigests is set
    // and that isClaimDigestUsed returns true post-claim.
    await airdrop.connect(owner).startClaims();
    const sig = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await airdrop.connect(alice).claim(AMOUNT, NONCE, sig);

    expect(await airdrop.isClaimDigestUsed(alice.address, AMOUNT, NONCE)).to.be.true;
    // hasClaimed fires first on repeated attempt
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "AlreadyClaimed");
  });

  // ---- maxClaims -----------------------------------------------------------

  it("rejects a claim when maxClaims is reached", async function () {
    const factory = await ethers.getContractFactory("OBNAirdropClaim", owner);
    const tiny = await factory.deploy(
      await token.getAddress(), backend.address, owner.address, 1n
    );
    await token.mint(await tiny.getAddress(), AMOUNT * 2n);
    await tiny.connect(owner).startClaims();

    const sigAlice = await signClaim(backend, tiny, alice.address, AMOUNT, NONCE);
    const sigBob   = await signClaim(backend, tiny, bob.address,   AMOUNT, NONCE);

    await tiny.connect(alice).claim(AMOUNT, NONCE, sigAlice);

    await expect(tiny.connect(bob).claim(AMOUNT, NONCE, sigBob))
      .to.be.revertedWithCustomError(tiny, "MaxClaimsReached");

    expect(await tiny.remainingClaims()).to.equal(0n);
  });

  // ---- invalid signature ---------------------------------------------------

  it("rejects a signature from an unauthorized key", async function () {
    await airdrop.connect(owner).startClaims();
    const sig = await signClaim(alice, airdrop, alice.address, AMOUNT, NONCE);
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "InvalidSignature");
  });

  it("rejects when submitted amount doesn't match signed amount", async function () {
    await airdrop.connect(owner).startClaims();
    const sig = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await expect(airdrop.connect(alice).claim(AMOUNT * 2n, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "InvalidSignature");
  });

  it("rejects a signature intended for a different recipient", async function () {
    await airdrop.connect(owner).startClaims();
    const sig = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await expect(airdrop.connect(bob).claim(AMOUNT, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "InvalidSignature");
  });

  // ---- wrong chain / wrong contract ----------------------------------------

  it("rejects a signature built with the wrong chainId", async function () {
    await airdrop.connect(owner).startClaims();
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "OBNAirdropClaim", version: "1",
      chainId: Number(chainId) + 1,
      verifyingContract: await airdrop.getAddress(),
    };
    const sig = await backend.signTypedData(
      domain, CLAIM_TYPES, { recipient: alice.address, amount: AMOUNT, nonce: NONCE }
    );
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "InvalidSignature");
  });

  it("rejects a signature built for a different contract address", async function () {
    await airdrop.connect(owner).startClaims();
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "OBNAirdropClaim", version: "1",
      chainId: Number(chainId),
      verifyingContract: bob.address, // wrong
    };
    const sig = await backend.signTypedData(
      domain, CLAIM_TYPES, { recipient: alice.address, amount: AMOUNT, nonce: NONCE }
    );
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "InvalidSignature");
  });

  // ---- zero amount ---------------------------------------------------------

  it("rejects a zero-amount claim", async function () {
    await airdrop.connect(owner).startClaims();
    const sig = await signClaim(backend, airdrop, alice.address, 0n, NONCE);
    await expect(airdrop.connect(alice).claim(0n, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "ZeroAmount");
  });

  // ---- paused --------------------------------------------------------------

  it("rejects claims when paused, allows after unpause", async function () {
    await airdrop.connect(owner).startClaims();
    await airdrop.connect(owner).pause();
    const sig = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "EnforcedPause");
    await airdrop.connect(owner).unpause();
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, sig))
      .to.emit(airdrop, "Claimed").withArgs(alice.address, AMOUNT, NONCE, 1n);
  });

  // ---- signer rotation -----------------------------------------------------

  it("only accepts claims signed by the new signer after setSigner", async function () {
    await airdrop.connect(owner).startClaims();
    const signers    = await ethers.getSigners();
    const newBackend = signers[4];
    await airdrop.connect(owner).setSigner(newBackend.address);

    const oldSig = await signClaim(backend,    airdrop, alice.address, AMOUNT, NONCE);
    const newSig = await signClaim(newBackend, airdrop, alice.address, AMOUNT, NONCE);

    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, oldSig))
      .to.be.revertedWithCustomError(airdrop, "InvalidSignature");
    await expect(airdrop.connect(alice).claim(AMOUNT, NONCE, newSig))
      .to.emit(airdrop, "Claimed").withArgs(alice.address, AMOUNT, NONCE, 1n);
  });

  // ---- withdrawAirdropTokens -----------------------------------------------

  it("blocks owner withdrawal during active campaign (not paused, not complete)", async function () {
    await airdrop.connect(owner).startClaims();
    await expect(airdrop.connect(owner).withdrawAirdropTokens(owner.address, AMOUNT))
      .to.be.revertedWithCustomError(airdrop, "WithdrawNotAllowed");
  });

  it("allows emergency withdrawal while paused", async function () {
    await airdrop.connect(owner).startClaims();
    await airdrop.connect(owner).pause();
    const contractBal = await token.balanceOf(await airdrop.getAddress());
    await expect(airdrop.connect(owner).withdrawAirdropTokens(owner.address, contractBal))
      .to.emit(airdrop, "AirdropTokensWithdrawn")
      .withArgs(owner.address, contractBal);
    expect(await token.balanceOf(await airdrop.getAddress())).to.equal(0n);
  });

  it("allows withdrawal once maxClaims is reached (campaign complete)", async function () {
    const factory = await ethers.getContractFactory("OBNAirdropClaim", owner);
    const tiny = await factory.deploy(
      await token.getAddress(), backend.address, owner.address, 1n
    );
    // Fund with more than one claim so there's a remainder to withdraw
    await token.mint(await tiny.getAddress(), AMOUNT * 2n);
    await tiny.connect(owner).startClaims();

    const sig = await signClaim(backend, tiny, alice.address, AMOUNT, NONCE);
    await tiny.connect(alice).claim(AMOUNT, NONCE, sig);

    expect(await tiny.totalClaims()).to.equal(1n);
    expect(await tiny.remainingClaims()).to.equal(0n);

    // maxClaims reached — withdrawal now allowed
    await expect(tiny.connect(owner).withdrawAirdropTokens(owner.address, ethers.MaxUint256))
      .to.emit(tiny, "AirdropTokensWithdrawn");
  });

  it("allows max uint256 withdrawal to drain full balance", async function () {
    await airdrop.connect(owner).pause();
    const contractBal = await token.balanceOf(await airdrop.getAddress());
    await airdrop.connect(owner).withdrawAirdropTokens(owner.address, ethers.MaxUint256);
    expect(await token.balanceOf(await airdrop.getAddress())).to.equal(0n);
    expect(await token.balanceOf(owner.address)).to.be.gte(contractBal);
  });

  it("blocks non-owner from withdrawing", async function () {
    await airdrop.connect(owner).pause();
    await expect(airdrop.connect(alice).withdrawAirdropTokens(alice.address, AMOUNT))
      .to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
  });

  // ---- InsufficientAirdropBalance ------------------------------------------

  it("reverts with InsufficientAirdropBalance when contract is underfunded", async function () {
    const factory = await ethers.getContractFactory("OBNAirdropClaim", owner);
    const empty   = await factory.deploy(
      await token.getAddress(), backend.address, owner.address, MAX_CLAIMS
    );
    await empty.connect(owner).startClaims();

    const sig = await signClaim(backend, empty, alice.address, AMOUNT, NONCE);
    await expect(empty.connect(alice).claim(AMOUNT, NONCE, sig))
      .to.be.revertedWithCustomError(empty, "InsufficientAirdropBalance");
  });

  it("reverts with InsufficientAirdropBalance when amount exceeds balance", async function () {
    await airdrop.connect(owner).startClaims();
    const bigAmount = ethers.parseEther("2000000");
    const sig = await signClaim(backend, airdrop, alice.address, bigAmount, NONCE);
    await expect(airdrop.connect(alice).claim(bigAmount, NONCE, sig))
      .to.be.revertedWithCustomError(airdrop, "InsufficientAirdropBalance");
  });

  // ---- isClaimDigestUsed ---------------------------------------------------

  it("isClaimDigestUsed returns false before claim, true after", async function () {
    await airdrop.connect(owner).startClaims();
    expect(await airdrop.isClaimDigestUsed(alice.address, AMOUNT, NONCE)).to.be.false;
    const sig = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await airdrop.connect(alice).claim(AMOUNT, NONCE, sig);
    expect(await airdrop.isClaimDigestUsed(alice.address, AMOUNT, NONCE)).to.be.true;
  });

  it("isClaimDigestUsed returns false for a different nonce", async function () {
    await airdrop.connect(owner).startClaims();
    const sig = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    await airdrop.connect(alice).claim(AMOUNT, NONCE, sig);
    expect(await airdrop.isClaimDigestUsed(alice.address, AMOUNT, NONCE + 1n)).to.be.false;
  });

  // ---- getClaimDigest consistency ------------------------------------------

  it("getClaimDigest matches what signTypedData produces", async function () {
    const digest = await airdrop.getClaimDigest(alice.address, AMOUNT, NONCE);
    const sig    = await signClaim(backend, airdrop, alice.address, AMOUNT, NONCE);
    expect(ethers.recoverAddress(digest, sig)).to.equal(backend.address);
  });
});
