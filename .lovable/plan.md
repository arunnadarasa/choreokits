**Goal**
Restore the published app so `/` loads like preview, while keeping Midnight SDK/WASM strictly client-side.

**What I verified**
- Published `/` currently returns the app’s root error UI, not the full demo page.
- The most recent production worker requests are HTTP 200, which means the server is responding but TanStack is rendering its error boundary.
- The older production crash was `Identifier '__tla' has already been declared`; current config already limits the top-level-await plugin to the client build.
- The home route is `ssr: false`, but it still has a top-level type import from `@midnight-ntwrk/dapp-connector-api` and lazy components may still pull Midnight modules through the route graph.

**Plan**
1. **Expose the current route error in production safely**
   - Temporarily make the root error boundary show the actual error message/stack in the published page, so the next failure is visible immediately on mobile instead of only showing “This page didn’t load”.
   - Keep the fallback simple and removable.

2. **Harden the route against SSR/package graph leakage**
   - Change `src/routes/index.tsx` so Midnight wallet API types are type-only/local and do not require a top-level Midnight package import in the route module.
   - Ensure only hydrated client/lazy components import Midnight SDK packages.

3. **Fix the likely production runtime mismatch**
   - If the visible error confirms a `browser-level` / `abstract-level` / IndexedDB/private-state provider issue, replace the current `levelPrivateStateProvider + BrowserLevel` production path with an in-browser private state provider backed by `localStorage` or IndexedDB-lite behavior, avoiding fragile CJS/Level interop in published builds.
   - Keep the witness secret local to the browser only.

4. **Keep Midnight stubbing clean for server builds**
   - Keep the Vite SSR stubs for `@midnight-ntwrk/*` and `src/lib/contract.ts`.
   - Avoid adding Nitro-disabling changes because the published worker needs the bundled server output.

5. **Verify**
   - Fetch the published URL after implementation to confirm it no longer renders the error page.
   - Check production logs for any new stack trace.
   - If publishing is needed, prompt you to hit **Publish / Update** so the live site receives the fix.