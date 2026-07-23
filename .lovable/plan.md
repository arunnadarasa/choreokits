The active `.workspace/skills/lovable-midnight/SKILL.md` already contains many of the Cursor post-mortem items (Fly.io stack, `setContractAddress`, blank-page failure mode, funding gotcha), but several important learnings are missing or actively contradicted by the skill. This plan updates the skill to fully absorb the Cursor input.

## Verified gaps in the current skill

1. **Vite config essentials still recommends the wrong `optimizeDeps`.** Current code block uses `include: ['@midnight-ntwrk/compact-runtime']`, which the Cursor post-mortem flags as making things worse. The working pattern is `noDiscovery: true` + minimal `include` + explicit `exclude` for every `@midnight-ntwrk/*` package.
2. **No dedicated `src/client.tsx` async Buffer polyfill example.** The blank-page fix is only mentioned as a failure-mode row; the skill does not show the canonical `await import('buffer')` then `hydrateRoot` pattern.
3. **SSR guidance contradicts the Cursor lesson.** The skill says "Mark every Midnight page `ssr: false`", but Cursor says keep an SSR shell on the index route and gate only Midnight-heavy widgets behind `<ClientOnly>`.
4. **Kit Feed / `txId` persistence not documented.** Cursor's "persist feed entries only after confirmed success; attach chain metadata at write time" and `KitPayload.txId?` pattern are absent.
5. **Missing operational sections:** dev workflow (`dev:fast`), Git/Lovable rules, extension-noise debugging, key-files quick reference, testing checklist, and expanded retrospective items.

## Plan

### 1. Rewrite "Vite config essentials (Cloudflare Worker target)"
Replace the existing `optimizeDeps` block with the Cursor-proven pattern:
- `noDiscovery: true`
- Minimal `include`: `react`, `react-dom`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `buffer`, `object-inspect`, `cross-fetch`, `@subsquid/scale-codec`
- `exclude` covering all `@midnight-ntwrk/*` packages (compact-runtime, onchain-runtime-v3, midnight-js-*)
- Keep `midnightSsrStub`, `wasm`, and client-only `topLevelAwait`

### 2. Add "Client bootstrap — async Buffer polyfill" section
Show the canonical `src/client.tsx`:
```ts
import { Buffer } from 'buffer';
const mod = await import('@tanstack/react-start/client');
const { StartClient } = mod;
const root = document.getElementById('root');
(globalThis as any).Buffer = Buffer;
hydrateRoot(root, <StartClient />);
```
Explain why module-scope `Buffer = ...` is insufficient and why the polyfill must complete before `hydrateRoot`.

### 3. Reconcile SSR guidance
Update "Frontend — TanStack Start specifics":
- Keep the root/index route SSR-enabled so the shell renders in <2s even when the client entry is slow.
- Gate Midnight wallet widgets, contract modules, and WASM imports behind `<ClientOnly>` or dynamic `import()` inside `useEffect`.
- Reserve `ssr: false` only for routes where the library touches browser globals at import time and cannot be isolated.
- Keep `ssr: false` as a route-level escape hatch in the failure-mode table, but change the default advice to "SSR shell + ClientOnly widgets".

### 4. Add "Kit Feed / transaction hash persistence" section
Document:
- Define `KitPayload` with optional `txId?: string` from the start.
- Write feed entries to `localStorage` only after the mint succeeds, including the returned `txId`.
- For Undeployed, `txId` comes from `/api/mint` response.
- For Preview/Preprod, `txId` comes from Lace `publishKit`.
- Dedupe by `publishedAt`; prefer the local row that already has `txId` when the indexer catches up.

### 5. Add operational sections from Cursor
- **Dev workflow**: `bun run compile` (first time / clean), `bun run dev` (day-to-day), optional `dev:fast` that skips Docker/deploy, `bun run midnight:down && bun run midnight:up` for chain reset.
- **Git / Lovable rules**: never force-push connected branches, keep `.env` gitignored with `.env.example`, don't commit `midnight-level-db/` or debug ingest URLs.
- **Debugging hygiene**: check `/.vite/deps/react.js` first, filter MetaMask/extension noise, use a git-ignored file or env-gated flag for agent logs instead of hardcoded `localhost:7560` URLs.
- **Key files quick reference**: table mapping `vite.config.ts`, `src/client.tsx`, `src/routes/index.tsx`, `src/lib/mint.server.ts`, `src/routes/api/mint.ts`, `src/components/PublishKitForm.tsx`, `src/components/KitFeed.tsx`, `.env`, `scripts/deploy-midnight.mjs`, `docker-compose.yml` to their roles.
- **Testing checklist**: hard refresh shell <2s, wallet panel mounts, Undeployed mint returns `txId`, feed shows full hash, grep clean of `7560/ingest`, `.env` not staged.

### 6. Expand "Retrospective — how I'd do it differently next time"
Add Cursor items:
- Apply Vite `noDiscovery` config on day one.
- Ship SSR shell + `src/client.tsx` + Buffer polyfill in the initial template.
- Scaffold `/api/mint` + `IS_UNDEPLOYED` branch before building Lace-only publish UX.
- Define `KitPayload.txId?` from the start.
- Surface expected proof timings in the UI.
- Consolidate `KitPayload` type in one file (`src/lib/contract.ts`).
- Use Network tab first before adding ingest-based debug logging.
- Split `compile` script docs into "full reset" vs "dev only".
- Commit `.env.example` with a placeholder contract address.

### 7. Add one-line summary
End the skill with the Cursor summary: "Midnight WASM + default Vite pre-bundling = blocked client entry and blank pages; constrain the optimizer, SSR the shell, set contract address before private state, and persist tx IDs after mint—not before."

## Deliverable
A single updated `lovable-midnight` skill file that is internally consistent, fixes the wrong `optimizeDeps` advice, and captures all Cursor learnings without losing the existing Fly.io and deploy-script content.