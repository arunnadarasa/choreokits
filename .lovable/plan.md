## Diagnosis

Deployment succeeded (contract at `e275956a...` is on-chain and written to `.env`). The only failure is `vite dev`:

```
Cannot find module 'rollup'
  at node_modules/vite-plugin-top-level-await/dist/index.js
```

`vite-plugin-top-level-await` does a bare `require("rollup")` at load time. Vite 7 bundles its own Rollup and no longer hoists `rollup` to the top-level `node_modules/`, so the plugin can't resolve it. This only bites on the user's fresh install; it "worked before" because older lockfiles happened to hoist rollup.

## Fix plan

Two small edits, no behavior change:

1. **Add `rollup` as an explicit devDependency** in `package.json` so it's present at `node_modules/rollup` for the plugin's `require()`. Pin to the version Vite 7 uses (`^4`).

2. **Guard against the same class of failure**: also add `@rollup/plugin-virtual`'s peer? — not needed; only `rollup` itself is missing. Nothing else to add.

After the edit, the user runs:

```
bun install
bun run dev
```

(No need to re-run `midnight:compile` or redeploy — the contract is already live and `.env` is set.)

## Technical detail

- Root cause: `vite-plugin-top-level-await@1.x` has `rollup` as a peerDependency; bun's strict install doesn't auto-install peers.
- Alternative considered: drop `vite-plugin-top-level-await` and rely on esbuild's `supported: { "top-level-await": true }` (already set in `optimizeDeps`). Rejected for this turn because the Midnight WASM packages need TLA support in the *build* Rollup pass, not just dep-optimize — removing the plugin would break the production client bundle we just spent hours stabilizing.
