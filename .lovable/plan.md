Apply the working fixes from `arunnadarasa/midnightwebinar` (per its `Cursor Input.md` post-mortem) to this repo.

## Root cause (from the post-mortem)

Vite's dep pre-bundler crawled the Midnight WASM graph on first load, hanging every `/.vite/deps/*` request for minutes — so the TanStack client entry never loaded and the page stayed blank. Fix: `noDiscovery: true` with a minimal `include`, exclude every `@midnight-ntwrk/*` from pre-bundling, ship a custom client entry that polyfills `Buffer` before `hydrateRoot`, and keep SSR enabled on the home route so the shell renders while client JS boots.

## Changes

1. **`vite.config.ts`** — keep existing `midnightSsrStub()` + `clientTopLevelAwait()` + WASM plugin, but replace the `optimizeDeps` block with:
   - `noDiscovery: true`
   - `include`: `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `buffer`, `object-inspect`, `cross-fetch`, `@subsquid/scale-codec`
   - `exclude`: `@midnight-ntwrk/compact-runtime`, `@midnight-ntwrk/onchain-runtime-v3`, its `_bg.wasm`, `@midnight-ntwrk/midnight-js-contracts`, `@midnight-ntwrk/midnight-js-protocol`, `@midnight-ntwrk/midnight-js-types`, `@midnight-ntwrk/midnight-js-utils`
   - Drop the current `esbuildOptions` (deprecated in Vite 8; the warning already showed up in the terminal).

2. **New `src/client.tsx`** — async `Buffer` polyfill, then `hydrateRoot(document, <StartClient />)` inside `startTransition`. Wired via `tanstackStart.client = { entry: "client" }` in `vite.config.ts`.

3. **`src/routes/index.tsx`** — remove `ssr: false` so the header + "Loading Midnight client…" fallback renders server-side. `ClientOnly` still gates the Midnight-heavy widgets underneath. No other logic changes.

4. **`src/lib/mint.server.ts`** — call `privateStateProvider.setContractAddress(contractAddress)` before any `get`/`set` inside `publishKitLocal()`. Fetch the reference file to copy the exact fix (server helper structure is otherwise identical to ours).

5. **`src/components/PublishKitForm.tsx`** — extend `KitPayload` with optional `txId`, and write the feed row only after `/api/mint` (or the Lace `publishKit`) returns success, attaching the returned `txId`.

6. **`src/components/KitFeed.tsx`** — render `tx: {hash}` with a source label (`on-chain` / `chain` / `local`) and dedupe by `publishedAt`, preferring the local row that already has a `txId`.

7. **Skill update — `.agents/skills/lovable-midnight/SKILL.md`** — add a short "Blank page on first `bun run dev` (Vite dep pre-bundling crawls Midnight WASM)" entry to the failure-modes table with the `noDiscovery` + custom `client.tsx` fix, and note "Keep SSR on the shell route; gate only Midnight widgets behind `ClientOnly`" as a rule.

Not touched: `docker-compose.yml`, `scripts/deploy-midnight.mjs`, `src/router.tsx`, `src/server.ts`, `src/routes/__root.tsx`, `src/lib/contract.ts` (Lace-signed path stays as-is for Preview/Preprod).

## Verification (after switching to build mode)

- `curl http://localhost:8080/` returns a body with "Tokenized Choreo Kits" (SSR shell).
- `curl http://localhost:8080/.vite/deps/react.js` returns 200 quickly.
- Hard-reload in Chrome: header visible in <2s; the Midnight widgets swap in after client hydration.
- `POST /api/mint` returns `{ txId }` and the Kit Feed shows the full hash.
