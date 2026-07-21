## Diagnosis

Same class of error as the rollup one — `vite-plugin-top-level-await` `require()`s peer deps at load time and bun doesn't auto-install peers. Now it's `esbuild` missing.

## Fix

Add `esbuild` as an explicit devDependency (pin to whatever Vite 7 uses, `^0.24`). Then `bun install && bun run dev`.

Preempting the next iteration: the plugin's peers are `rollup` (already added) and `esbuild`. That's the full set — after this the dev server should start.
