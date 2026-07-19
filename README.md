# Tokenized Choreo Kits

**Sell bundled choreography sequences as tokenized, licensable assets on Midnight.**
Single-page Midnight ZK demo — Compact 0.23 contract, Lace wallet, local proof server.

> Built during the **Creative AI & Quantum Hackathon** organised by StreetKode Fam
> during Indian Krump Festival 14.

## The idea

Choreographers today have no privacy-preserving way to license routines. Post it
publicly and anyone can copy it; keep it private and you can't sell it. Midnight's
ZK ledger lets us publish the **kit** (title, steps, price) while keeping the
**author's identity** hidden behind a per-entry commitment. Buyers see verifiable
provenance; sellers stay pseudonymous.

## Hackathon fit

Targeted at the **DeFi Track** (tokenized/licensable content) with strong overlap
into Gaming/Creative and Best Beginner Hack.

| Criterion | How this project addresses it |
| --- | --- |
| **Technology** | Compact 0.23 ZK circuit, `persistentHash` author commitment, `disclose()` boundary, local proof server for real ZK proving. |
| **Originality** | ZK for choreography IP — an unexplored niche. Public catalog + private authorship is a genuinely new tradeoff. |
| **Execution** | One polished page. Real "Proving… 30–120s" UX. Lace-native auth, no Web2 fallback. |
| **Completion** | End-to-end: connect → deploy → publish → browse. All in a single index route. |
| **Documentation** | This README covers setup, run, and criteria in under 5 minutes. |
| **Business value** | MVP for a choreography licensing marketplace — creators keep pseudonymity, buyers get provable authorship. |

## Stack

- Vite + React SPA (TanStack Start template, single index route).
- Compact 0.23 contract → local proof server on `:6300`.
- Lace wallet is the sole auth surface.
- All Midnight code paths gated behind `<ClientOnly>` for SSR safety.
- Local standalone stack (node + indexer + proof server) via Docker.

## Contract

See [`contracts/TokenizedChoreoKits.compact`](./contracts/TokenizedChoreoKits.compact).
Public ledger: `kit_count`, `last_kit` (JSON blob), `last_author_commitment`.
Private witness: `localSecretKey()` → per-user 32-byte value in `localStorage`.
Circuit: `publishKit(payload)` writes the commitment + payload and bumps the counter.

## One-time local setup

```bash
# 1. Compact compiler
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source ~/.bashrc && compact update

# 2. Compile the contract and copy ZK assets into public/
compact compile contracts/TokenizedChoreoKits.compact contracts/managed/tokenized-choreo-kits
cp -r contracts/managed/tokenized-choreo-kits/keys public/keys
cp -r contracts/managed/tokenized-choreo-kits/zkir public/zkir

# 3. Bring up the local Midnight stack (node + indexer + proof server)
bun scripts/midnight-standalone.mjs up   # first run pulls ~1 GB
```

Point Lace at the local node: **Settings → Network → Custom → `ws://localhost:9944`**.
The genesis wallet is pre-funded with unlimited tDUST — no faucet.

## Deploy the contract

```bash
VITE_NETWORK_ID=undeployed bun scripts/deploy-midnight.mjs
# → prints a hex contract address
```

Paste the hex address into the **Deploy contract** panel in the app (or set
`VITE_DEFAULT_CONTRACT` in your `.env`).

## Run the app

```bash
cp .env.example .env
bun install
bun run dev
```

Open the preview, connect Lace, paste the deployed contract address, and mint kits.

## Environment

Copy `.env.example` to `.env`:

```
VITE_NETWORK_ID=undeployed
VITE_INDEXER_URL=http://localhost:8088/api/v3/graphql
VITE_INDEXER_WS_URL=ws://localhost:8088/api/v3/graphql/ws
VITE_PROOF_SERVER_URL=http://localhost:6300
VITE_NODE_WS=ws://localhost:9944
VITE_DEFAULT_CONTRACT=  # paste hex address after deploy
```

> The local Indexer uses `/api/v3/graphql` — not v4. Preview/preprod hosted
> indexers use v4.

## Explicit non-goals (5-credit scope)

- No IPFS/Pinata — kit content is inline JSON.
- No AI Gateway calls.
- No transfer/resale logic yet — v1 is the license record. Marketplace tx flow
  is a natural v2 using the same contract shape.
- No tests, no CI. Ship the demo.

## Credits

Built during the **Creative AI & Quantum Hackathon** organised by StreetKode Fam
during Indian Krump Festival 14.
