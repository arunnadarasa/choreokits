## Plan

1. **Fix the frontend contract loader**
   - Change `src/lib/contract.ts` so `loadContractModule()` imports the actual compiler output path: `contracts/managed/tokenized-choreo-kits/contract/index.js`.
   - Remove the stale `index.cjs` / `public/contract` assumptions and update the error message to match the current workflow.

2. **Keep the current compile/deploy flow**
   - Leave `bun run compile` behavior intact because your terminal output shows it successfully compiled, started Docker, deployed, wrote `VITE_DEFAULT_CONTRACT`, and launched Vite.

3. **Verify the user-visible result**
   - Check that the app can see the default deployed contract address from `.env` and no longer reports “Compiled contract not found in public/contract”.
   - Confirm the next expected blocker, if any, is the real Lace/Midnight transaction path rather than a missing artifact path.

## What you should do after approval

Run only:

```bash
bun run dev
```

No need to re-run `bun run compile` unless you changed the Compact contract.