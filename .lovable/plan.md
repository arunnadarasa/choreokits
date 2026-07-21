## Problem

Wallet has 0 dust. The standalone chain's genesis-funded seed (per testkit's `LocalTestEnvironment`) is:

```
0000000000000000000000000000000000000000000000000000000000000002
```

Our deploy script uses `...0001`, which has no balance — hence `Insufficient Funds: could not balance dust`.

## Fix

In `scripts/deploy-midnight.mjs` line 44, change the seed constant from `...0001` to `...0002`.

Also add a `waitForDust` step after `Starting wallet sync...` that polls `wallet.state()` until the dust balance is > 0 (with a 60s timeout) so the deploy waits for the wallet to actually see the genesis UTXO before submitting the tx, and fails with a clear "no dust on seed X — is the node freshly reset?" message otherwise.

## Verify

```bash
docker compose down -v && bun run compile
```

Expect the wallet to sync, show a dust balance, then `Contract deployed at: 0200…`.

No README changes.