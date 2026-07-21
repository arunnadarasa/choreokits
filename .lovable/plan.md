## Root cause

`@midnight-ntwrk/midnight-js-contracts` calls `providers.walletProvider.balanceTx(provenTx)` with **one argument**. Our `balanceTx`/`midnightProvider` in `scripts/deploy-midnight.mjs` was written as `(tx, ttl) => ...` and forwarded that `undefined` `ttl` to `wallet.balanceUnboundTransaction(tx, keys, { ttl })`. The dust wallet then does `Intent.new(ttl)` → `.getTime()` on `undefined` → the exact crash:

```
undefined is not an object (evaluating 'arg0.getTime')
  at .../wallet-sdk-dust-wallet/dist/v1/Transacting.js:285
```

So the wallet + genesis dust are actually fine — we just never gave the balancing call a valid TTL.

## Fix (single file: `scripts/deploy-midnight.mjs`)

1. Import `ttlOneHour` from `@midnight-ntwrk/midnight-js-utils`.
2. In both `walletProvider.balanceTx` and `midnightProvider.balanceTx`, ignore any caller-provided `ttl` and compute one locally:
   ```js
   balanceTx: async (tx) => {
     const ttl = ttlOneHour();
     const recipe = await wallet.balanceUnboundTransaction(
       tx,
       { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
       { ttl },
     );
     return wallet.finalizeRecipe(recipe);
   },
   ```
3. Leave everything else (genesis seed `...0002`, 15s sync wait, insufficient-funds retry loop, ZK config path, witnesses) unchanged — those were fine.

## Verify

Re-run:

```bash
docker compose down -v
bun run compile
```

Success = script logs `Contract deployed at: 0200…` and writes `VITE_DEFAULT_CONTRACT=` into `.env`, then `bun run dev` boots the UI.

If a new error appears, capture the full stack — but the `getTime` crash will be gone.
