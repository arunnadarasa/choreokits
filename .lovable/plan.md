Update the `.agents/skills/lovable-midnight/SKILL.md` file to include the critical lesson that the **deployer's genesis-funded seed is not the same as the user's Lace wallet balance on Undeployed**. A connected Lace wallet starts with 0 tDUST, so write transactions (mint/prove) will fail unless the wallet is funded first.

## Proposed changes

1. **Add a new "Funding the Undeployed wallet" section** (before or alongside the existing "Funding (only if you insist on preview/preprod)" section) that explains:
   - On `Undeployed`, the deploy script uses the deterministic genesis-funded seed `…0002` — this funds the **deployer** wallet, not the Lace browser extension the demo user connects.
   - Lace connected to `undeployed` starts with **0 tDUST**.
   - Any contract write (mint, prove, etc.) requires tDUST for fees; without it, submission fails with a generic "Unexpected error submitting scoped transaction" or an insufficient-balance error.
   - Fund Lace on Undeployed using the local dev faucet/tool (e.g. `midnight-local-dev` CLI) against the Lace unshielded address, or include a `scripts/fund-lace.sh` helper in the project.
   - Show a UI guard: read `api.getDustBalance()`, display tDUST balance, and disable the write button with a "Fund your Lace wallet first" message when balance is zero.

2. **Update the "Failure modes ranked by frequency" table** with a new row:
   - Symptom: "Mint fails / Lace shows 0 / 250,000 tDUST" or "Unexpected error submitting scoped transaction" after Lace signs.
   - Cause: Lace wallet on Undeployed has no tDUST; fees cannot be paid.
   - Fix: Fund the Lace unshielded address with tDUST via the local dev faucet before minting; surface the balance in the UI so the user knows why the button is disabled.

3. **Update the "Retrospective" / best-practices list** to add:
   - "Fund Lace on Undeployed before letting the user mint." The genesis seed only pays for the deploy script; every end-user wallet (including the demo wallet) needs its own tDUST.

## Why this matters

The current skill mentions funding only for Preview/Preprod and implies Undeployed skips the faucet dance. That is true for the deployer, but misleading for the end-user Lace wallet. Several debugging turns in the hackathon were spent on this exact confusion, so the skill should call it out explicitly.