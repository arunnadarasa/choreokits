## Root cause

`scripts/deploy-midnight.mjs` proceeds even when the genesis wallet hasn't synced (`synced=false balances={}`). With 0 dust, every `deployContract` attempt is rejected by the mempool with `Custom error: 171`, and the 8-attempt retry loop can't help because the wallet is still empty.

Confirmed by Midnight AI: the correct gate is **spendable DUST coins** (`dust.availableCoins.length >= 1`), not just `syncProgress.synced` — a wallet can report synced-to-tip at block 0/1 with zero spendable UTXOs.

## Changes (single file: `scripts/deploy-midnight.mjs`)

1. **Replace `waitForWalletReady` with `waitForSpendableDust`.** Subscribe to `wallet.state()` with rxjs `filter` for `state.dust?.availableCoins.length >= 1`; use `timeout()` to fail with a clear error. This is the pattern from the official `wait-for-dust.ts` script.
2. **Bump timeout to 300s** (matches the official example default).
3. **Throw on timeout** instead of warning and falling through — deploying without dust is guaranteed to fail with error 171, so fail fast with an actionable message ("wallet never received dust; check proof-server health at http://localhost:6300/version and that node produced blocks past #0").
4. **Log sync progress each poll** (`applyGap`, `sourceGap`, `synced`, dust `balance` and `availableCoins.length`) so a stuck sync is diagnosable at a glance.
5. **Re-check dust between deploy retries.** If a retry hits error 171 again, poll `availableCoins` before resubmitting — avoids burning 8×10s on empty-wallet resubmits.
6. **Pre-flight proof-server health check.** `GET /version` before starting the wallet; if it fails, print the exact `curl` command the user should run.

No changes to the contract, frontend, `mint.server.ts`, Docker stack, or `package.json`. Only the deploy script.

## Verification

```bash
docker compose down -v && bun run compile
```

Expected: sync log shows `availableCoins=1+` within ~30–120s of wallet start, then a single successful `deployContract` on attempt 1. If it fails, the new error message will name which precondition wasn't met (proof-server down / node stuck at #0 / dust never arrived) instead of looping silently.
