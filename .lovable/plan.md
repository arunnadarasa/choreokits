## Diagnosis

The published site is failing before the React app can render. Server logs show:

```text
SyntaxError: Identifier '__tla' has already been declared
```

This points to the `vite-plugin-top-level-await` transform colliding in the Cloudflare/Nitro server bundle. The current config applies `topLevelAwait()` globally, so it can rewrite both client and SSR chunks. The Midnight code that needs WASM/top-level-await is client-only, and SSR already stubs Midnight modules plus disables SSR for the home route.

## Plan

1. **Constrain the top-level-await plugin to the browser build only**
   - Replace the direct `topLevelAwait()` usage in `vite.config.ts` with a small wrapper plugin.
   - The wrapper will return the real plugin only when `configEnvironment.name === "client"`.
   - SSR/Nitro builds will no longer receive generated `__tla` declarations.

2. **Keep the existing Midnight SSR safety net**
   - Leave `tanstackStart.server.entry = "server"` in place.
   - Keep `midnightSsrStub()` so `@midnight-ntwrk/*` packages and `src/lib/contract.ts` are not bundled into SSR runtime code.
   - Keep Nitro enabled so the published worker remains a single deployable server bundle.

3. **Verify locally with the production build path**
   - Run the production build after the config change.
   - Confirm the previous build errors and `__tla` collision are gone.

4. **Publish after the build passes**
   - Once approved and fixed, use the Publish button / Update flow so the published `choreokits.lovable.app` URL gets the corrected bundle.