## Problem

Deployment fails at `new Contract(...)` with:

> first (witnesses) argument to Contract constructor does not contain a function-valued field named `localSecretKey`

The compiled contract requires a `witnesses` object with a `localSecretKey` function, but `scripts/deploy-midnight.mjs` uses `CompiledContract.withVacantWitnesses`, which passes an empty witnesses object. Compact witness functions must return `[newPrivateState, value]`.

## Fix (one file)

Edit `scripts/deploy-midnight.mjs`:

1. Drop the `CompiledContract.withVacantWitnesses` step.
2. Provide an explicit witnesses object to `CompiledContract.make`:
   ```js
   const witnesses = {
     localSecretKey: (ctx) => {
       // Deploy-time secret: random 32 bytes; the browser has its own witness.
       const sk = ctx?.privateState?.localSecretKey ?? crypto.getRandomValues(new Uint8Array(32));
       return [{ ...(ctx?.privateState ?? {}), localSecretKey: sk }, sk];
     },
   };
   const compiledContract = CompiledContract.make(
     "TokenizedChoreoKitsContract",
     Contract,
     witnesses,
   ).pipe(CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH));
   ```
   (If `CompiledContract.make` in this SDK version doesn't take witnesses positionally, use the equivalent `.pipe(CompiledContract.withWitnesses(witnesses))` — I'll pick the right one based on the installed types when implementing.)
3. Set `initialPrivateState: { localSecretKey: crypto.getRandomValues(new Uint8Array(32)) }` so the deployer has a stable seed.

The constructor doesn't invoke `localSecretKey`, so no proof cost changes — this only satisfies the Contract-class witness-shape check.

## Verify

```bash
docker compose down -v && bun run compile
```

Expect `Contract deployed at: 0200…`, `.env` gets `VITE_DEFAULT_CONTRACT`, then `bun dev` boots.

No README changes needed.