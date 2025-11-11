# OBN v9.0 Upgrade - Master Announcement

**Timeline: Live November 11, 2025 at 10:19 PM CST**

---

## The Full Story

We discovered a critical security issue in OBN StakingPools v8.9.0 that we were preparing to deploy. Instead of pushing the vulnerable version to mainnet, we fixed it and built v9.0.

### The Problem: v8.9.0 forceExitUser() Honeypot Risk

v8.9.0 included a `forceExitUser()` function with a `recipient` parameter:

```solidity
function forceExitUser(uint256 pid, address user, address recipient) external {
    // User's tokens go to recipient address
    // Admin could call: forceExitUser(pid, user, attacker_address)
    // Result: User loses all tokens to attacker
}
```

This created a **honeypot pattern** - a malicious admin could steal user tokens. Even though the intent was good (emergency exits), the implementation was dangerous.

### Our Response: v9.0 with forceExitUserToSelf()

We completely redesigned the emergency exit to eliminate the theft vector:

```solidity
function forceExitUserToSelf(uint256 pid, address user, bool claimRewards) external {
    // User's tokens returned to THEMSELVES ONLY
    // No recipient parameter = impossible to redirect funds
    // Admin can trigger it but can't steal tokens
}
```

### What v9.0 Includes

**From v8.9.0 (the good parts):**
- `removePool()` - Safely remove pools with charity wallet fallback
- `shutdownPool()` - Block new deposits while allowing exits
- Pool lifecycle management

**New in v9.0 (the fixes + improvements):**
- `forceExitUserToSelf()` - Safe emergency exit (honeypot fixed)
- `migrateBootstrap()` - Nonprofit bootstrap address migration (atomic, safe)
- Reward preservation validation (prevents silent reward loss)
- Lock overflow prevention (prevents lock corruption)
- Atomic charity wallet updates (all-or-nothing operations)

---

## Why This Matters

We found a critical issue before it reached mainnet. We fixed it completely. We're being transparent about it. And v9.0 is now **safer and better** than what we originally planned.

**That's security-first development.**

---

## What Changes for Users

### For Regular Stakers
✅ **Everything stays exactly the same**
- Staking works identically
- Claiming rewards works identically  
- Unstaking works identically
- Reward splits (88% user, 10% charity, 1% treasury, 1% fund) unchanged
- APY unchanged
- All your stakes, rewards, and locks completely safe

### For Nonprofits
🆕 **New Bootstrap Migration Feature**
- Seamlessly migrate your bootstrap position to a new nonprofit address
- All pending rewards migrate with you
- All locked tokens transfer correctly
- Atomic operation (all-or-nothing)
- One transaction instead of manual coordination

### For Developers
🔧 **New Safe Functions**
- `forceExitUserToSelf(uint256 pid, address user, bool claimRewards)` - Safe emergency exits
- `migrateBootstrap(uint256 pid, address oldNonprofit, address newNonprofit)` - Bootstrap migrations
- All existing functions unchanged

---

## Technical Verification

| Aspect | Status |
|--------|--------|
| Tests Passing | ✅ 14/14 |
| Backward Compatible | ✅ Yes |
| Storage Layout Changed | ❌ No |
| Existing Functions Changed | ❌ No |
| Breaking Changes | ❌ None |
| Honeypot Risk | ✅ Fixed |
| Gas Overhead | ✅ <1% |
| Audit Status | ✅ Self-audited, issue found and fixed |

---

## Version Timeline

- **v8.5.0** (Current): Basic staking, currently live
- **v8.9.0** (Planned): Added forceExitUser() but found honeypot risk → NOT DEPLOYED
- **v9.0** (New): Fixed forceExitUser() to forceExitUserToSelf() + bootstrap migration + safety checks → DEPLOYING NOW

**Key Point**: We jumped from v8.5.0 to v9.0 because v9.0 is the safe, complete version that fixed the issue we found in v8.9.0.

---

## FAQ

**Q: Was v8.9.0 ever deployed to mainnet?**
A: No. We caught the issue during our audit and fixed it before any deployment.

**Q: Is v9.0 safe?**
A: Yes. All 14 tests passing. Honeypot risk completely removed. Extra safety validations added.

**Q: Will my tokens be locked during the upgrade?**
A: No. The upgrade happens at the contract level. Your tokens stay accessible.

**Q: Will my rewards change?**
A: No. Same 88/10/1/1 split. Same APY. Same calculations.

**Q: Do I need to do anything?**
A: No action needed. The upgrade happens automatically on November 11.

**Q: Why did you explain all this?**
A: Transparency. We found a security issue, fixed it, and are being open about what we found and how we addressed it. This shows our commitment to your security.

**Q: What if something goes wrong after deployment?**
A: The timelock gives us 24 hours to cancel if needed. After that, we can always upgrade again if issues arise.

---

## Bottom Line

We were going to deploy v8.9.0. We audited it. We found a honeypot risk. We fixed it. Now we're deploying v9.0 - which is safer, has more features, and is completely transparent about what we found and fixed.

Your stakes are safer tomorrow. Your rewards still work the same. You get new features. And you can trust that we audit our code seriously.

**That's how you build a secure, trustworthy protocol.**

See you on the v9.0 side. 🌿🔐

---

## Deployment Details

**Network**: Base Mainnet (chainId 8453)
**Proxy Address**: 0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2
**New Implementation**: 0xD2A067721291EB46B735bcB020b5230774E3EE8C
**Timelock**: 0x86396526286769ace21982E798Df5eef2389f51c
**Timelock Delay**: 86400 seconds (24 hours)

**Go Live**: Tuesday, November 11, 2025 at 10:19 PM CST

---

## Resources

- Full announcement: [V9_UPGRADE_ANNOUNCEMENT.md](./V9_UPGRADE_ANNOUNCEMENT.md)
- Deployment guide: [V9_DEPLOYMENT_GUIDE.md](./V9_DEPLOYMENT_GUIDE.md)
- Git commit: Check the commit history for v9.0 upgrade
- Basescan: [Verify contract](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2)

Questions? Ask in Discord or follow @OBN on X for updates.

🔐 Security. 🌿 Growth. 📈 Trust.
