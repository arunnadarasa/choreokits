## Diagnosis

The published site 500s with:
```
Error: No such module "assets/react". imported from "assets/server-CNx9r4ch.js"
```

This is a Cloudflare workerd bundling issue, not a Midnight error. Setting `nitro: false` in `vite.config.ts` disabled the Cloudflare worker bundler, so the SSR entry gets built as a plain code-split Node-style bundle with sibling chunks (`assets/react.js`, etc.). workerd can't resolve dynamic sibling chunks — it only loads what's inlined into the single worker script — so every request 500s before any of our code runs.

We turned nitro off originally to keep Midnight WASM out of the SSR bundle, but we already have `midnightSsrStub()` in `vite.config.ts` that redirects `@midnight-ntwrk/ledger-v8`, `@midnight-ntwrk/onchain-runtime-v3`, and `@/lib/contract` to empty stubs during SSR, plus the home route is `ssr: false`. Nitro is safe to re-enable.

## Fix

1. **`vite.config.ts`** — remove `nitro: false` so the Cloudflare worker bundler runs and produces a single inlined worker script. Keep `midnightSsrStub()`, the WASM plugins, and the SSR resolve conditions.
2. **Verify** — re-publish, load `https://choreokits.lovable.app/` on the phone. Expect the app shell to render, then the ssr:false home route to hydrate and boot Midnight client-side.
3. If SSR still complains about a Midnight symbol we haven't stubbed, add it to the `wasmTargets` set in `midnightSsrStub` (same pattern as the existing two entries) and republish.

No changes to the Midnight contract, deploy script, or Docker stack.
