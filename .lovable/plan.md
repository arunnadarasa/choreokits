# Tokenized Choreo Kits — Midnight ZK Single-Page Demo

A single-page Vite + React app on Midnight (Undeployed / local stack) where choreographers publish tokenized choreography "kits" (title + steps summary + price) as on-chain entries, with a ZK author commitment proving authorship without revealing the author's secret key. Tuned to the hackathon's judging criteria (Technology, Originality, Execution, Completion, Documentation, Business Value) and targeted at the **DeFi Track** (tokenized/licensable assets on Midnight) with strong overlap into **Gaming/Creative** (choreo sequences).

## Hackathon fit

- **DeFi Track angle**: choreo kits as tokenized, licensable, resaleable content — confidential author identity, public catalog of kits + prices, verifiable authorship.
- **Originality**: privacy-preserving IP registry for dancers (unusual domain for ZK).
- **Completion**: end-to-end demo — connect, deploy, publish kit, browse kits — inside one page.
- **Documentation**: single README with run steps + criteria mapping.
- **Business value**: pitch as an MVP for a choreography licensing marketplace.

## Scope (5-credit hard limit)

- ONE Vite + React SPA (no router beyond the default index route).
- ONE Compact contract (≤80 lines) — `TokenizedChoreoKits.compact`.
- Lace wallet only. Local proof server on `:6300`. Local standalone stack on `:9944` / `:8088`.
- No Lovable Cloud, no DB, no server auth, no AI calls, no IPFS (kit content stays inline as an `Opaque<"string">` JSON blob to stay within budget).

## Contract (Compact 0.23)

`contracts/TokenizedChoreoKits.compact`, ≤80 lines. Header comment credits the hackathon. Public ledger:
- `kit_count: Counter`
- `last_kit: Opaque<"string">` — JSON `{title, steps, priceDust}` set by the latest `publishKit` call
- `last_author_commitment: Bytes<32>` — `persistentHash(["choreo:author:", seq, sk])`

Witness: `localSecretKey(): Bytes<32>` (32-byte value persisted in `localStorage`, wired via `witnesses`).

Circuit: `publishKit(payload: Opaque<"string">): []` — mirrors the boilerplate `appendEntry` pattern (disclose payload, disclose author commitment, increment counter). Constructor initializes counter and `last_kit`.

Compiled with `compact compile`, keys/zkir copied to `public/keys` and `public/zkir`.

## Frontend flow (single page)

1. Buffer polyfill as the first line of `src/main.tsx`.
2. `<ClientOnly>` boundary wraps everything Midnight-related; providers loaded inside `useEffect`.
3. **Connect Lace panel** (from the provided boilerplate) — shielded address + network pill.
4. **Deploy panel** — button calls `deployContract` with witnesses; shows a persistent "Proving… 30–120s" state; on success writes address to `localStorage` (and prints it so the user can paste into `VITE_DEFAULT_CONTRACT`).
5. **Publish Kit form** — title, steps textarea, price in tDUST → JSON payload → `publishKit` circuit call, same Proving state.
6. **Kit feed** — read-only GraphQL query against `VITE_INDEXER_URL` (`contractAction(address).state`), decode via the compiled contract's `ledger()` helper (client-only import), display latest kit + author commitment (truncated) + entry count. Polls every 5s.
7. Footer credit line on every screen.

## Files to create

```
contracts/TokenizedChoreoKits.compact
src/main.tsx                              (Buffer polyfill first line)
src/App.tsx                               (single page composition)
src/components/ClientOnly.tsx
src/components/WalletConnectPanel.tsx     (from boilerplate)
src/components/DeployPanel.tsx
src/components/PublishKitForm.tsx
src/components/KitFeed.tsx
src/lib/use-midnight-wallet.ts            (from boilerplate)
src/lib/lace.ts                           (waitForLace helper)
src/lib/providers.ts                      (initProviders)
src/lib/contract.ts                       (deploy + call helpers, lazy import managed/)
src/lib/indexer.ts                        (readLedger + decode)
src/lib/secret.ts                         (localStorage 32-byte secret)
vite.config.ts                            (wasm + top-level-await, esnext)
.env.example                              (all VITE_* secrets)
README.md                                 (setup + judging-criteria map)
```

Note: TanStack Start default template will be reduced to a single index route; `__root.tsx` keeps its shell but head() gets real title/description ("Tokenized Choreo Kits — ZK licensing for choreography"). `<ClientOnly>` gates the entire Midnight surface so SSR/prerender stays safe.

## Required secrets (Undeployed)

- `VITE_NETWORK_ID=undeployed`
- `VITE_INDEXER_URL=http://localhost:8088/api/v4/graphql`
- `VITE_INDEXER_WS_URL=ws://localhost:8088/api/v4/graphql/ws`
- `VITE_PROOF_SERVER_URL=http://localhost:6300`
- `VITE_NODE_WS=ws://localhost:9944`
- `VITE_DEFAULT_CONTRACT=<hex from local deploy>`

## What the human runs locally (documented in README, not by Lovable)

1. Install Compact compiler + `compact update`.
2. `compact compile contracts/TokenizedChoreoKits.compact contracts/managed/tokenized-choreo-kits` → copy `keys/` and `zkir/` into `public/`.
3. Bring up local stack: `bun scripts/midnight-standalone.mjs up` (proof server + node + indexer).
4. Point Lace to `ws://localhost:9944`.
5. `VITE_NETWORK_ID=undeployed bun scripts/deploy-midnight.mjs` → paste hex into `VITE_DEFAULT_CONTRACT`.

## Explicit non-goals

- No IPFS/Pinata (payload inline).
- No AI Gateway calls.
- No marketplace transfer logic v1 — "resale" is framed as the license record; a follow-up is noted in the README.
- No tests, no CI, no docs site.

## Judging-criteria mapping (README section)

- **Technology**: Compact ZK circuit + persistentHash author commitment + local proof server.
- **Originality**: privacy for choreographers — an underexplored ZK vertical.
- **Execution**: one polished page, real Proving UX (30–120s state).
- **Completion**: connect → deploy → publish → browse works end-to-end.
- **Documentation**: single README covers setup, run, and criteria.
- **Business Value**: framed as MVP for a choreo licensing marketplace.

Confirm and I'll build it exactly as scoped.
