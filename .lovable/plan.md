## Diagnosis

Published SSR now returns 200 — the `__tla` bug is gone. The mobile "This page didn't load" screen is our React `errorComponent` catching a **client-side** crash during the Midnight contract module boot:

```
TypeError: Class extends value undefined is not a constructor or null
  at browser-level-BQ7fVMvx.js
  at contract-BNVWKR6u.js
```

`browser-level` (pulled in transitively by `@midnight-ntwrk/midnight-js-level-private-state-provider`) extends `AbstractLevel` from `abstract-level`. In production Rollup output the base class resolves to `undefined` — a classic CJS/ESM interop failure that dev (esbuild) hides. Preview works because preview serves the dev build.

## Plan

1. **Force correct CJS/ESM interop for the `level` stack** in `vite.config.ts`:
   - `optimizeDeps.include`: `abstract-level`, `browser-level`, `level-transcoder`, `module-error`, `catering`, `queue-microtask`, `maybe-combine-errors`.
   - `build.commonjsOptions.transformMixedEsModules: true` and `defaultIsModuleExports: 'auto'`.
   - `ssr.noExternal` already covers Midnight — extend to include the level packages so they aren't left as bare externals.

2. **Verify** by running a production build locally (`bun run build`) and grepping the emitted `browser-level-*.js` chunk to confirm `AbstractLevel` is resolved (not `undefined`). Then publish and reload on the phone.

3. **Fallback if step 1 doesn't stick** (documented, only executed if the rebuild still throws): swap the persistent-state provider for the in-memory one in `src/lib/contract.ts` — the demo doesn't need cross-session state, and this removes the entire `level` dependency from the client bundle.

### Files touched

- `vite.config.ts` — add `optimizeDeps.include`, `build.commonjsOptions`, extend `ssr.noExternal`.
- (Fallback only) `src/lib/contract.ts` — switch to `inMemoryPrivateStateProvider`.

No UI, no contract, no deploy-script changes.
