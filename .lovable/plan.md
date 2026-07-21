**Goal**
Fold this turn's production-deploy debugging into `.agents/skills/lovable-midnight/SKILL.md` so the next agent skips the multi-hour SSR/hydration loop we just walked through.

**New material to add**

1. **New "Publishing to Cloudflare Workers (TanStack Start)" section**, above the existing frontend section, capturing the hard-won rules:
   - Keep `nitro` **enabled** (don't set `nitro: false`) — disabling it splits the SSR bundle into chunks the Worker can't resolve (`No such module "assets/react"`).
   - Restrict `vite-plugin-top-level-await` to the **client environment only** via `applyToEnvironment(env => env.name === "client")`. Running it in the SSR bundle causes `Identifier '__tla' has already been declared` in the workerd build.
   - Add a `midnightSsrStub()` Vite plugin (`enforce: "pre"`) that, when `options.ssr` is true:
     - redirects every `@midnight-ntwrk/*` import to an empty stub module, AND
     - resolves the id normally then swaps the absolute path of `src/lib/contract.ts` for `src/lib/contract.ssr-stub.ts` (aliases, relative imports, and `@/` all funnel through the same absolute path).
   - Home route must be `ssr: false`, but that alone is **not enough** — the SSR bundler still crawls the module graph, so both stubs above are required or the build dies with `MISSING_EXPORT "ContractState"` / `createCircuitCallTxInterface`.
   - Never keep a top-level runtime `import` from `@midnight-ntwrk/*` in a route file. Type-only imports are fine (erased), but even those are risky — prefer defining the ConnectedAPI shape locally or importing types from a client-only module.

2. **New failure-modes table rows** (extend the existing ranked table):
   | Symptom | Cause | Fix |
   | --- | --- | --- |
   | Published `/` shows generic "This page didn't load", preview works | Client-hydration crash hidden by root ErrorBoundary | Temporarily render `error.message` + `error.stack` in the root `errorComponent` to see the real cause on mobile |
   | Prod runtime: `Class extends value undefined is not a constructor or null` in `browser-level-*.js` | `levelPrivateStateProvider` → `browser-level` → `abstract-level` CJS/ESM interop breaks in Rollup production bundle | Do NOT ship `levelPrivateStateProvider` to the browser. Write a tiny `localStorage`-backed `PrivateStateProvider<string, unknown>` (encode `Uint8Array` as `{__type:"Uint8Array",data:[...]}`) — see reference implementation in `src/lib/contract.ts` |
   | Build error `MISSING_EXPORT "X" is not exported by "src/lib/midnight-ssr-stub.ts"` | Real client module (e.g. `src/lib/contract.ts`) was pulled into SSR bundle and hit the stub | Extend the SSR stub plugin to also swap the client module for a dedicated `.ssr-stub.ts` by absolute path |
   | Prod SSR 500 `No such module "assets/react"` from `assets/server-*.js` | `nitro: false` produced multi-chunk SSR output workerd can't resolve | Re-enable `nitro`, keep the Midnight SSR stubs |
   | Prod SSR crash `Identifier '__tla' has already been declared` | `vite-plugin-top-level-await` applied to the SSR bundle | Wrap the plugin with `applyToEnvironment(env => env.name === "client")` |

3. **New "Private state provider" subsection** under the SDK guidance:
   - Reference implementation: a `localStorage`-backed provider keyed by `choreo-kits:private-state:v1:<coinPubKey>:contracts:<addr>:states:<id>` with `Uint8Array` JSON encoding.
   - Rationale: avoids the entire `level` dependency chain, which is the #1 source of production hydration crashes.
   - Node deploy script can still use `levelPrivateStateProvider` (Node CJS interop is fine) — the ban is browser-only.

4. **New "Debugging a black/error published page on mobile" playbook**:
   1. Temporarily render `error.message` + `error.stack` in the root TanStack `errorComponent`.
   2. Also update `src/server.ts` to catch SSR throws and inline the stack into the fallback HTML.
   3. `Publish → Update`, reload on device, read the real error.
   4. Revert the verbose error UI once fixed.

5. **Update the retrospective** with:
   - "Assume every Node-ecosystem storage lib (`level`, `classic-level`, `browser-level`) will break production Rollup. Pick pure-JS/`localStorage`/`IndexedDB` from day one."
   - "Enable production build + published deploy early — preview passes hide Nitro/workerd/CJS interop bugs."

**Skill file layout change**
Everything lands in the existing `.agents/skills/lovable-midnight/SKILL.md` — no new reference files. The file stays under the ~50KB guidance.

**Verify**
- After edits: `code--view` the file to confirm section ordering and no duplicate headings.
- Run `skills--apply_draft` on `.agents/skills/lovable-midnight` so the updates become active.
