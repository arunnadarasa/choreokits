
# Update `lovable-midnight` skill with this build's learnings

Rewrite `.agents/skills/lovable-midnight/SKILL.md` (copied from the active `.workspace/skills/lovable-midnight/SKILL.md`) with a new **Local standalone stack** track and expanded failure-modes, based on everything we hit in the last ~8 hours. Then apply via `skills--apply_draft`.

## New / rewritten sections

### 1. Add "Local standalone stack (Undeployed)" as a first-class option
Currently the skill only documents preview/preprod + a solo proof server. Add:

- Three-container `docker-compose.yml` using the **official standalone images** (NOT the partner-chain 2.x images):
  - `midnightntwrk/proof-server:8.0.3` on `:6300`
  - `midnightntwrk/midnight-node:0.22.5` on `:9944` with `CFG_PRESET=dev`
  - `midnightntwrk/indexer-standalone:4.0.2` on `:8088` (GraphQL v1 path is `/api/v1/graphql`, but wallet SDK 4.x expects **v4** — call out the mismatch)
- Env template for undeployed:
  ```
  VITE_NETWORK_ID=undeployed
  VITE_INDEXER_URL=http://localhost:8088/api/v1/graphql
  VITE_INDEXER_WS_URL=ws://localhost:8088/api/v1/graphql/ws
  VITE_PROOF_SERVER_URL=http://localhost:6300
  ```
- Genesis-funded seed for the local chain is `...0002`, **not** `...0001`. This burned an hour.
- One `bun run compile` script that chains: `compact compile` → `cp -r contracts/managed/*/{keys,zkir,contract} public/contract/` → `docker compose up -d` → `bun scripts/deploy-midnight.mjs` → write `VITE_DEFAULT_CONTRACT` into `.env`.

### 2. Add "Do NOT use these images" callout
- `midnightntwrk/midnight-node:latest` — tag doesn't exist.
- `midnightntwrk/midnight-node:2.x` (partner-chain) — requires Cardano follower + Postgres + `mock_registrations_file`; not usable as a hackathon standalone.
- Pin exact tags in the skill.

### 3. Rewrite the deploy-script canonical shape
Add a full `scripts/deploy-midnight.mjs` reference that bakes in every gotcha:
- Import `ttlOneHour` from `@midnight-ntwrk/midnight-js-utils` and force it inside both `walletProvider.balanceTx` and `midnightProvider.balanceTx` — the contracts SDK calls `balanceTx` with no TTL and the dust wallet crashes on `undefined.getTime()`.
- `privateStoragePasswordProvider` password MUST contain ≥3 of {upper, lower, digit, symbol}. `choreo-kits-local-password` fails; `Choreo-Kits-Local-2026!` passes.
- Provide an explicit witness object (`{ localSecretKey: (ctx) => [ctx, key] }`) — `withVacantWitnesses` does not satisfy compiled contracts that declare witnesses.
- `initialPrivateState: { localSecretKey: <32B> }` — required or the constructor throws "does not contain a function-valued field named localSecretKey".
- Resolve `ZK_CONFIG_PATH` from **project root**, not `scripts/`. The wrong resolve produces `ENOENT .../scripts/contracts/managed/...`.
- Wait 10–15 s after `wallet.start()` before deploying; wrap `deployContract` in a retry loop (8× / 10 s) — the wallet needs to sync the genesis balance or you get `Insufficient Funds: could not balance dust`.
- Use a **fresh `privateStateId`** per retry (timestamp suffix) so retries don't collide with "state already exists".
- Add a `checkContainerHealthy('node')` early-exit before deploy so a crash-looping node fails fast instead of hanging balancing dust.

### 4. Rewrite the frontend (TanStack Start) section
- `lazy()` imports of components that use named exports need `.then(m => ({ default: m.Named }))`.
- Hex-address regex for `VITE_DEFAULT_CONTRACT` must be `/^(0x)?[0-9a-fA-F]{6,}$/` — the common `/^0x?.../` bug rejects any address that starts with a non-`0` hex character.
- Lace `getUnshieldedAddress()` returns either a string OR `{ unshieldedAddress }` depending on wallet build — handle both.
- Disable Nitro (`nitro: false`) in `vite.config.ts` and mark the Midnight route `ssr: false`. WASM top-level-await + `Buffer` cannot cross the workerd SSR boundary.
- Add `vite-plugin-wasm` + `vite-plugin-top-level-await` to Vite plugins.
- Copy contract artefacts (`keys/`, `zkir/`, `contract/`) into `public/contract/` and serve via a browser `FetchZKConfigProvider` that implements `get()` + `asKeyMaterialProvider()`.
- SDK export name is `UnprovenTransaction` (0.22+), not `UnboundTransaction`.

### 5. Expand the failure-modes table
Add new rows:
| Symptom | Cause | Fix |
| `mock_registrations_file must be defined` | Using partner-chain node image | Switch to `midnight-node:0.22.5` with `CFG_PRESET=dev` |
| `db_sync_postgres_connection_string must be defined` | Same as above | Same |
| `Insufficient Funds: could not balance dust` on fresh chain | Using seed `...0001` or deploying before wallet sync | Use seed `...0002`; wait 15 s + retry |
| `undefined is not an object (evaluating 'arg0.getTime')` | Contracts SDK calls `balanceTx` without TTL | Force `ttlOneHour()` in both balance providers |
| `Password must contain at least 3 of…` | Weak private-storage password | Use ≥3 character classes |
| `does not contain a function-valued field named localSecretKey` | Missing witness object | Pass explicit witnesses + `initialPrivateState` |
| `Failed to read verifier key ENOENT .../scripts/contracts/…` | ZK_CONFIG_PATH resolved from `scripts/` | Resolve from project root |
| Frontend says "Enter the hex contract address" for a valid `d9e6…` address | Regex `/^0x?[0-9a-fA-F]{6,}$/` requires literal `0` | Use `/^(0x)?[0-9a-fA-F]{6,}$/` |
| Nitro build `MISSING_EXPORT` on `@midnight-ntwrk/*` | WASM/TLA in worker SSR | `nitro: false` + `ssr: false` on Midnight routes |

### 6. Combined-command "quick start" block
Add a single copy-paste macOS/Linux block:
```bash
compact update
bun install
bun run compile          # compile + copy artefacts + docker up + deploy + write .env
bun run dev
```
And a Windows PowerShell equivalent that uses `docker compose` + `bun`.

### 7. "How I'd do it differently next time" retrospective (short, in skill voice)
- Start with the **standalone Docker Compose** stack from minute one — don't try preview/preprod first for a hackathon (faucet + tDUST dance eats time).
- Write the deploy script **before** the UI; the SDK version drift (TTL, witness shape, password rules, seed index) is where hours vanish.
- Bake artefact copy (`keys/`, `zkir/`, `contract/`) into `bun run compile` so the browser can't get out of sync.
- Assume every wallet-SDK adapter needs a TTL shim.

## Non-goals
- Not adding Fly.io deployment (keep that in the separate `canton-fly-deploy` skill; only cross-reference).
- Not touching `midnight-environment-setup` or `react-wallet-connector`.

## Files touched
- `.agents/skills/lovable-midnight/SKILL.md` (rewrite, ~450 lines)
- Then `skills--apply_draft .agents/skills/lovable-midnight`
