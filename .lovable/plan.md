# Fix: `/contract/index.js` cannot be imported from source

## What's happening

`src/lib/contract.ts` does `await import("/contract/index.js")` to load the compiled Compact contract that we copy into `public/contract/`. Vite 8 refuses to resolve any import path that points into `/public` (even with `/* @vite-ignore */`) and throws:

> Failed to load url /contract/index.js ... This file is in /public ... should not be imported from source code.

The overlay hides the app on `bun run dev`.

## Fix

Load the contract module through a runtime URL that Vite can't statically resolve, so it never enters the resolver at all — and guard it so it only runs in the browser.

In `src/lib/contract.ts`, replace the `loadContractModule` body:

- Return `null` when `typeof window === "undefined"` (SSR safety).
- Build the URL at runtime: `const url = new URL("/contract/index.js", window.location.origin).href;`
- Call `await import(/* @vite-ignore */ /* webpackIgnore: true */ url)` via an indirection Vite's static analyzer can't follow, e.g. `const dynamicImport = new Function("u", "return import(u)"); const mod = await dynamicImport(url);`
- Keep the try/catch and cache; drop the `candidates` array (single entry).

That pattern is the standard escape hatch for importing a file that lives in `/public`: the `new Function` wrapper makes the import opaque to the bundler, and the absolute origin URL ensures the browser fetches it from the dev server / published site correctly.

## Verification

1. `bun run dev` — overlay is gone, `/` renders.
2. Open the app, connect Lace, publish a kit — the contract module still loads and the ZK call still fires (Network tab shows `GET /contract/index.js` returning 200).
3. `bun run build` — no SSR resolver error.

No other files need to change.
