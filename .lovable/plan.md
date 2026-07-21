# Fix: "Compiled contract not found in public/contract"

## Root cause (confirmed)

The deploy succeeded (contract `e0c334…9d18` is on-chain and `.env` was written). The UI error comes from `loadContractModule()` in `src/lib/contract.ts`, which does:

```ts
const url = new URL("/contract/index.js", window.location.origin).href;
const dynamicImport = new Function("u", "return import(u)");
const mod = await dynamicImport(url);
```

Two problems:
1. The Compact 0.23 compiler emits **`index.cjs`** (CommonJS), not `index.js`. The fetch is 404.
2. Even if the path were fixed, browsers cannot dynamic-`import()` a raw CommonJS file served from `/public`. The `require`/`module.exports` calls would throw.

Copying files into `public/` and fetching them at runtime is the wrong strategy for a bundler-produced JS module. Vite must transform it.

## Fix

Import the compiled contract statically through Vite so it goes through the CJS→ESM interop and top-level-await/WASM plugins:

1. **`src/lib/contract.ts`** — replace `loadContractModule()` body with a plain dynamic import of the source file under `contracts/managed/…`:
   ```ts
   export async function loadContractModule() {
     if (contractModuleCache) return contractModuleCache;
     if (typeof window === "undefined") return null;
     const mod = await import("../../contracts/managed/tokenized-choreo-kits/contract/index.cjs");
     contractModuleCache = (mod as any).default ?? mod;
     return contractModuleCache;
   }
   ```
   Keep the `typeof window` guard so SSR still short-circuits (the `contract.ssr-stub.ts` already replaces this whole module server-side, so the import never runs on the worker).

2. **`vite.config.ts`** — the existing `commonjsOptions: { transformMixedEsModules: true, defaultIsModuleExports: "auto" }` already handles CJS interop, no change needed. Confirm the `midnightSsrStub` still redirects `src/lib/contract.ts` → stub (already true).

3. **`package.json`** — the `midnight:artefacts` step still needs to copy `keys/` and `zkir/` into `public/` (the `FetchZKConfigProvider` fetches those at runtime, which is correct — they're binary ZK material, not JS modules). Remove only the `public/contract` copy since it's no longer used:
   ```jsonc
   // before
   "midnight:artefacts": "... && cp -r .../contract public/contract"
   // after
   "midnight:artefacts": "rm -rf public/keys public/zkir && cp -r .../keys public/keys && cp -r .../zkir public/zkir"
   ```

## Verification

1. Restart `bun run dev` (no need to re-run `bun run compile` — the contract is already deployed and artefacts exist on disk).
2. Reload the app, connect Lace, click **Mint Kit (ZK)** with the current form values.
3. Expect a `Proving…` state for 30–120s, then a tx hash link. The "Kit Feed" panel should tick `kitCount` to 2 within ~10s.
4. If proving fails, check the browser console for the real error (the fetch stubs are gone, so any residual issue will surface directly).

## Skill update (after fix confirmed working)

Add a note to `lovable-midnight` under "Failure modes": **Do not fetch compiled contract JS from `/public` at runtime.** Compact emits CJS (`index.cjs`); browsers cannot `import()` CJS directly. Always import the compiled contract through Vite so its CJS→ESM interop and WASM plugins run. `public/` is only for the binary `keys/` and `zkir/` fetched by `FetchZKConfigProvider`.
