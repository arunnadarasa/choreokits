---
name: lovable-midnight
description: Ship a Midnight ZK dApp (Compact contract + Lace wallet + proof server + Indexer reads) in a single Lovable build, on either the public preview/preprod testnets OR a fully local standalone Docker stack (Undeployed). Use when the user asks for anything on the Midnight Network — private-by-default smart contracts, zero-knowledge circuits, Lace wallet, tDUST, "how do I add privacy to my app", or a hackathon demo that must run offline / on a laptop.
---

# lovable-midnight

Build a Midnight Network dApp in one shot. Midnight is a privacy-first L1 where every smart contract has a public ledger, a ZK circuit, and a local off-chain component. Circuit parameters are **private by default** — you must call `disclose()` to move any value to public state.

## Pick the target FIRST

| Target | Use when | Wallet | Node/Indexer | Proof server |
| --- | --- | --- | --- | --- |
| **Undeployed / local standalone** | Hackathon, offline demo, no faucet dance, deterministic funding | Deploy script uses a genesis-funded seed; UI can still connect Lace on `undeployed` | Local Docker (`midnight-node:0.22.5` + `indexer-standalone:4.0.2`) | Local Docker (`proof-server:8.0.3`) |
| **Preview** (unstable, resets) | Sharing a preview link with real Lace users | Lace on Preview | Hosted by Nethermind | Local Docker or `cfg.proverServerUri` |
| **Preprod** (stable) | Anything demoed to real users, near-mainnet | Lace on Preprod | Hosted by Nethermind | Local Docker or `cfg.proverServerUri` |

For a hackathon under a deadline, **default to Undeployed** and skip the tNIGHT→tDUST faucet dance entirely. Do not start on preview/preprod "just in case" — the faucet + delegation flow burns 30+ min per new user.

## Non-negotiables

- **Compact language `0.23`**, MidnightJS `midnight-js-contracts@4.1.1`, `wallet@4.0.0`, `wallet-sdk-hd@3.1.0-beta.1`, `midnight-js-utils` (for `ttlOneHour`).
- Every `.compact` file starts with `pragma language_version 0.23;` and imports `CompactStandardLibrary`.
- Every ledger write from a circuit parameter needs `disclose(...)` — the whole privacy model.
- `witness` callbacks return values that never touch the chain. Never send the witness value in a transaction.
- Circuits are bounded: no recursion, no dynamic-length loops, no I/O, no oracles.
- Proofs on medium circuits (`k=14`) take **30–120s** on the local proof server (first proof is slowest; warm proofs are seconds). Every write UI must show a `Proving…` state and stay usable.
- **No SSR for the write path.** MidnightJS uses `window`, `Buffer`, and WASM top-level-await. Load `@midnight-ntwrk/*` behind a client-only boundary; put `import { Buffer } from 'buffer'; (globalThis as any).Buffer = Buffer;` as the FIRST line of `src/main.tsx` (Vite SPA) or of the client-only entry.
- **Do NOT** attempt Ethereum bridging, oracle calls inside circuits, or sub-second UX.

## Do NOT use these Docker images

- `midnightntwrk/midnight-node:latest` — **the `latest` tag does not exist**. Pull fails.
- `midnightntwrk/midnight-node:2.x` (partner-chain builds) — requires a Cardano follower + Postgres + `mock_registrations_file`. You'll chase config errors (`db_sync_postgres_connection_string must be defined`, then `mock_registrations_file must be defined`) forever. Not viable for a standalone hackathon.
- `midnightntwrk/indexer-standalone:latest` — pin an exact version.

**Use these exact tags** (verified working late-2026):

```
midnightntwrk/proof-server:8.0.3
midnightntwrk/midnight-node:0.22.5
midnightntwrk/indexer-standalone:4.0.2
```

## Local standalone stack (Undeployed) — canonical `docker-compose.yml`

```yaml
services:
  proof-server:
    image: midnightntwrk/proof-server:8.0.3
    command: ["midnight-proof-server", "-v"]
    ports: ["6300:6300"]

  node:
    image: midnightntwrk/midnight-node:0.22.5
    environment:
      CFG_PRESET: dev            # standalone dev chain, no partner-chain follower
    ports: ["9944:9944"]

  indexer:
    image: midnightntwrk/indexer-standalone:4.0.2
    depends_on: [node]
    environment:
      APP__INFRA__NODE__URL: ws://node:9944
    ports: ["8088:8088"]
```

Env for the frontend:

```
VITE_NETWORK_ID=undeployed
VITE_INDEXER_URL=http://localhost:8088/api/v1/graphql
VITE_INDEXER_WS_URL=ws://localhost:8088/api/v1/graphql/ws
VITE_PROOF_SERVER_URL=http://localhost:6300
VITE_DEFAULT_CONTRACT=<hex, written by deploy script>
```

Note: the standalone indexer serves GraphQL on **`/api/v1/graphql`**, but the hosted preview/preprod indexers use **`/api/v4/graphql`**. Use whichever matches the target. The `indexerPublicDataProvider` handles both if you pass the correct URL.

## Preview/Preprod network table (unchanged)

| Network | `VITE_NETWORK_ID` | Address prefix | Faucet | Explorer |
| --- | --- | --- | --- | --- |
| Preview | `preview` | `mn_shield-addr_undeployed1…` / `mn_addr_undeployed1…` (Lace labels "Preview") | `midnight-tmnight-preview.nethermind.dev` | `preview.midnightexplorer.com` |
| Preprod | `preprod` | `mn_shield-addr_test1…` / `mn_addr_test1…` | `midnight-tmnight-preprod.nethermind.dev` | `preprod.midnightexplorer.com` |

## Combined "quick start" — one macro per platform

macOS / Linux (Docker Desktop or colima running):

```bash
compact update
bun install
bun run compile          # compact compile → copy artefacts → docker compose up -d → deploy → write .env
bun run dev
```

Windows PowerShell:

```powershell
compact update
bun install
bun run compile
bun run dev
```

`package.json` scripts that make this work end-to-end:

```json
{
  "scripts": {
    "midnight:compile": "compact compile contracts/MyContract.compact contracts/managed/my-contract",
    "midnight:artefacts": "rm -rf public/contract && mkdir -p public/contract && cp -r contracts/managed/my-contract/keys contracts/managed/my-contract/zkir contracts/managed/my-contract/contract public/contract/",
    "midnight:up": "docker compose up -d && node -e \"setTimeout(()=>{},15000)\"",
    "midnight:down": "docker compose down -v",
    "midnight:deploy": "bun scripts/deploy-midnight.mjs",
    "compile": "bun midnight:compile && bun midnight:artefacts && bun midnight:up && bun midnight:deploy"
  }
}
```

Bake artefact copy into `bun run compile` from day one — the browser goes silently out of sync otherwise.

## Canonical Compact contract (unchanged)

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger entry_count: Counter;
export ledger last_message: Opaque<"string">;
export ledger last_author_commitment: Bytes<32>;

witness localSecretKey(): Bytes<32>;

constructor() { entry_count.increment(1); }

export circuit appendEntry(newMessage: Opaque<"string">): [] {
  const sk = localSecretKey();
  const seq = entry_count as Field as Bytes<32>;
  last_author_commitment = disclose(
    persistentHash<Vector<3, Bytes<32>>>([pad(32, "log:author:"), seq, sk])
  );
  last_message = disclose(newMessage);
  entry_count.increment(1);
}
```

Type-casting rules:
- `Counter → Field → Bytes<32>` is two steps: `x as Field as Bytes<32>`.
- String literals in `constructor()` are `Bytes<N>`, not `Opaque<"string">`. Don't try to initialize an `Opaque<"string">` ledger field with `"(empty)"`.

## Deploy script (`scripts/deploy-midnight.mjs`) — every gotcha baked in

Skeleton with the six lessons that cost the most time:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNetworkId, NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { WalletBuilder } from '@midnight-ntwrk/wallet';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';   // ← ①
import { Contract } from '../public/contract/contract/index.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ② Resolve ZK config from PROJECT ROOT, not scripts/
const ZK_CONFIG_PATH = path.resolve(__dirname, '..', 'contracts', 'managed', 'my-contract');

setNetworkId(NetworkId.Undeployed);

// ③ Genesis-funded standalone seed is ...0002 (NOT ...0001)
const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000002';

// ④ Password policy: ≥3 of {upper, lower, digit, symbol}
const PRIVATE_STORAGE_PASSWORD = 'Choreo-Kits-Local-2026!';

const deployerSecret = crypto.getRandomValues(new Uint8Array(32));

const wallet = await WalletBuilder.buildFromSeed(
  process.env.VITE_INDEXER_URL,
  process.env.VITE_INDEXER_WS_URL,
  process.env.VITE_PROOF_SERVER_URL,
  'ws://localhost:9944',
  GENESIS_SEED,
  NetworkId.Undeployed,
);
wallet.start();
await new Promise(r => setTimeout(r, 15000));   // ⑤ let wallet see genesis balance

const baseProviders = {
  privateStateProvider: levelPrivateStateProvider({ privateStateStoreName: 'midnight-priv' }),
  publicDataProvider: indexerPublicDataProvider(process.env.VITE_INDEXER_URL, process.env.VITE_INDEXER_WS_URL),
  zkConfigProvider: new NodeZkConfigProvider(ZK_CONFIG_PATH),
  proofProvider: httpClientProofProvider(process.env.VITE_PROOF_SERVER_URL),
  privateStoragePasswordProvider: { get: async () => PRIVATE_STORAGE_PASSWORD },
  walletProvider: {
    coinPublicKey: wallet.state().coinPublicKey,
    // ⑥ contracts SDK calls balanceTx WITHOUT ttl → dust wallet crashes on undefined.getTime()
    balanceTx: (tx, newCoins) => wallet.balanceTransaction(tx, newCoins, ttlOneHour()),
  },
  midnightProvider: {
    submitTx: (tx) => wallet.submitTransaction(tx),
    balanceTx: (tx, newCoins) => wallet.balanceTransaction(tx, newCoins, ttlOneHour()),
  },
};

// ⑦ Explicit witness object — withVacantWitnesses does NOT satisfy contracts that declare witnesses
const contractInstance = new Contract({
  localSecretKey: (ctx) => [ctx, deployerSecret],
});

// ⑧ Retry loop + fresh privateStateId per attempt
for (let i = 0; i < 8; i++) {
  try {
    const deployed = await deployContract(
      { ...baseProviders, privateStateId: `deploy-${Date.now()}-${i}` },
      {
        contract: contractInstance,
        initialPrivateState: { localSecretKey: deployerSecret }, // ⑨ REQUIRED
      },
    );
    console.log('Deployed at', deployed.deployTxData.public.contractAddress);
    // write VITE_DEFAULT_CONTRACT into .env here
    process.exit(0);
  } catch (e) {
    if (i === 7) throw e;
    console.warn(`Deploy attempt ${i+1} failed: ${e.message}. Retrying in 10s…`);
    await new Promise(r => setTimeout(r, 10000));
  }
}
```

Add a `checkContainerHealthy('node')` shell probe (parse `docker inspect`) before the wait — a crash-looping node otherwise hangs 15s + 8×10s = 95s before the first useful error.

### Deploy-script cheat sheet (memorize)

| ID | Rule |
| --- | --- |
| ① | Force `ttlOneHour()` in **both** `walletProvider.balanceTx` AND `midnightProvider.balanceTx`. |
| ② | `ZK_CONFIG_PATH` = `resolve(__dirname, '..', 'contracts/managed/<name>')`. Missing `..` → ENOENT. |
| ③ | Standalone genesis funds seed `…0002`, not `…0001`. Wrong seed → `Insufficient Funds`. |
| ④ | Password: ≥3 of {upper, lower, digit, symbol}. `choreo-kits-local-password` fails (2 classes). |
| ⑤ | 10–15 s wait after `wallet.start()` before deploying. |
| ⑥ | Adapter must inject TTL — contracts SDK calls `balanceTx` with no TTL. |
| ⑦ | Provide an explicit witness object `{ localSecretKey: (ctx) => [ctx, key] }`. |
| ⑧ | Retry deploy 8× / 10 s with a **fresh `privateStateId`** each attempt. |
| ⑨ | `initialPrivateState: { localSecretKey: <32B> }` — required or constructor throws. |

## Frontend — TanStack Start specifics

- Set `nitro: false` in `vite.config.ts` for the Midnight route path. WASM top-level-await + Node `Buffer` cannot cross the workerd SSR boundary; SSR builds fail with cryptic `MISSING_EXPORT` errors on `@midnight-ntwrk/*`.
- Mark the Midnight page `ssr: false` in its route definition.
- Add `vite-plugin-wasm` + `vite-plugin-top-level-await` to Vite plugins (already required for the SPA).
- `React.lazy()` of a component that uses **named exports** needs `.then(m => ({ default: m.MyNamed }))` — plain `lazy(() => import('./X'))` typechecks fail.
- Contract-address regex must be `/^(0x)?[0-9a-fA-F]{6,}$/`. The intuitive `/^0x?[0-9a-fA-F]{6,}$/` requires a literal leading `0` and rejects any address that starts with `1–9` or `a–f` (very common — e.g. `d9e6…`).
- Lace `getUnshieldedAddress()` returns EITHER `{ unshieldedAddress: string }` OR a raw `string` depending on the wallet build. Handle both:
  ```ts
  const raw = await api.getUnshieldedAddress();
  const address = typeof raw === 'string' ? raw : raw.unshieldedAddress;
  ```
- Copy compiled artefacts to `public/contract/{keys,zkir,contract}/` in the compile script; serve them with a browser `FetchZKConfigProvider` that implements `get()` + `asKeyMaterialProvider()`.
- SDK 0.22+ exports **`UnprovenTransaction`** — not `UnboundTransaction`. Old snippets are stale.

## Vite config essentials (unchanged)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
export default defineConfig({
  build: { target: 'esnext', commonjsOptions: { transformMixedEsModules: true } },
  plugins: [react(), wasm(), topLevelAwait()],
  optimizeDeps: {
    esbuildOptions: { target: 'esnext', supported: { 'top-level-await': true } },
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: ['@midnight-ntwrk/onchain-runtime-v3',
              '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm'],
  },
});
```

## Reading public ledger state (no wallet needed)

```ts
const r = await fetch(import.meta.env.VITE_INDEXER_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query($a:HexEncoded!){ contractAction(address:$a){ state } }`,
    variables: { a: contractAddress },
  }),
});
const stateHex = (await r.json()).data?.contractAction?.state;
```

Decode with the compiled contract's `ledger(state)` helper from `public/contract/contract/index.cjs` — client-only module.

## Funding (only if you insist on preview/preprod)

tNIGHT ≠ tDUST. Faucet dispenses tNIGHT; deploys spend tDUST.
1. Copy the **unshielded** address from Lace.
2. Paste into the faucet → tNIGHT arrives.
3. In Lace, click **Generate tDUST** to delegate → tDUST appears.
4. Only now can you deploy.

## Failure modes ranked by frequency (with new rows)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop / colima not started | Start it, wait for the whale icon, retry |
| Pull fails `midnightntwrk/midnight-node:latest not found` | `latest` tag doesn't exist | Pin `0.22.5` |
| Node container in "Restarting" loop, logs say `db_sync_postgres_connection_string must be defined` | Using partner-chain 2.x image | Switch to `midnight-node:0.22.5` with `CFG_PRESET=dev` |
| Node logs: `mock_registrations_file must be defined if use_main_chain_follower_mock is true` | Same — partner-chain image can't run standalone even in mock mode | Same fix; don't fight the 2.x image |
| Deploy fails `Insufficient Funds: could not balance dust` on fresh local chain | Wrong seed (`…0001`) OR deploying before wallet syncs the genesis balance | Use seed `…0002`; wait 15 s post-`wallet.start()`; retry loop |
| `undefined is not an object (evaluating 'arg0.getTime')` in `Transacting.js` | Contracts SDK calls `balanceTx` without a TTL; dust wallet crashes | Force `ttlOneHour()` inside both balance adapters |
| `Password must contain at least 3 of: uppercase letters, lowercase letters, digits, special characters. Found: 2` | Weak `privateStoragePasswordProvider` password | Use ≥3 character classes, e.g. `Choreo-Kits-Local-2026!` |
| `does not contain a function-valued field named localSecretKey` | Missing witness object on the `Contract` instance | Pass `{ localSecretKey: (ctx) => [ctx, key] }` and `initialPrivateState` |
| `Failed to read verifier key … ENOENT … scripts/contracts/managed/…` | `ZK_CONFIG_PATH` resolved from `scripts/` | `path.resolve(__dirname, '..', 'contracts/managed/<name>')` |
| Frontend says "Enter the hex contract address" for a valid `d9e6…` | Regex `/^0x?[0-9a-fA-F]{6,}$/` requires literal `0` | Use `/^(0x)?[0-9a-fA-F]{6,}$/` |
| Nitro SSR build `MISSING_EXPORT` on `@midnight-ntwrk/*` | WASM/TLA in workerd SSR | `nitro: false` + `ssr: false` on Midnight routes |
| `React.lazy` typecheck fails on Midnight components | Named export used with default-only `lazy` | `lazy(() => import('./X').then(m => ({ default: m.X })))` |
| `TypeError: undefined is not iterable` reading `unshieldedAddress` | Lace returns raw string in some builds | Handle both `string` and `{ unshieldedAddress }` |
| `ReferenceError: Buffer is not defined` | Missing polyfill | `import { Buffer } from 'buffer'; globalThis.Buffer = Buffer;` as FIRST line of client entry |
| Contract state undefined after deploy | ZK keys not served to browser | Ensure `public/contract/{keys,zkir,contract}/` populated by `bun run compile` |
| Proof hangs 30–120 s on first call | First warm-up after container boot | Expected; show a `Proving…` state |
| `window is not defined` at build/SSR | MidnightJS at module scope in a TanStack route | Move behind `useEffect` / `<ClientOnly>`; deploys via Node script only |
| `Lace not found` | Extension not installed / injected late | Poll `window.midnight` for 5 s before rejecting |
| `Cannot find package 'bip39'` etc. in deploy script | Node script deps not `bun add`-ed | Add every import to `package.json` |
| Preview shielded/unshielded prefix mismatch (`mn_addr_preview1…` vs `mn_shield-addr_test1…`) | Encoders derived through different `NetworkId` values | Use ONE `NetworkId` for both encoders in the script; validate the emitted prefix |
| User pastes their recovery phrase in chat | Full-wallet-control exfiltration risk | REFUSE. Give them a local `scripts/check-midnight-wallet.mjs` that reads `MIDNIGHT_WALLET_SEED` from their shell env and prints only public addresses |

## Network → NetworkId mapping

| `VITE_NETWORK_ID` | `NetworkId` | Unshielded prefix | Shielded prefix |
| --- | --- | --- | --- |
| `undeployed` | `NetworkId.Undeployed` | `mn_addr_undeployed1…` | `mn_shield-addr_undeployed1…` |
| `preview` | `NetworkId.Undeployed` (yes, Preview reuses Undeployed) | `mn_addr_undeployed1…` (Lace shows "Preview") | `mn_shield-addr_undeployed1…` |
| `preprod` / `testnet` | `NetworkId.TestNet` | `mn_addr_test1…` | `mn_shield-addr_test1…` |
| `mainnet` | `NetworkId.MainNet` | `mn_addr1…` | `mn_shield-addr1…` |

Use ONE `NetworkId` across BOTH encoders. Validate the emitted bech32 prefix before writing `.env` / `src/data/midnight-contract.json`; abort on mismatch.

## Deploy status UI pattern

```tsx
import contract from '@/data/midnight-contract.json';
const PLACEHOLDER = '0'.repeat(64);
const deployed = contract.address && contract.address !== PLACEHOLDER;
```

Treat the all-zero address as "not yet deployed". Show a "run `bun run compile`" hint otherwise. For Undeployed, skip explorer links (there is none) and instead render the local Indexer GraphQL URL as the "proof it's real" surface.

## Recovery-phrase safety (hard rule)

Never accept a seed phrase in chat. Ship a local script that reads `MIDNIGHT_WALLET_SEED` from the user's shell env and prints only public addresses. Never log, echo, or `console.log` the seed.

## Retrospective — how I'd do it differently next time

1. **Default to Undeployed + Docker Compose from minute one.** Preview/Preprod's tNIGHT→tDUST dance is a hackathon killer. Only reach for the hosted testnets when the demo needs real Lace users.
2. **Write `scripts/deploy-midnight.mjs` BEFORE any UI.** All the deep pain (TTL injection, witness shape, password rules, seed index, ZK config path, retry-with-fresh-`privateStateId`) lives here. A working deploy unblocks everything downstream; a broken deploy blocks all of it.
3. **Assume every wallet-SDK adapter needs a TTL shim.** Any `balanceTx` you hand to `midnight-js-contracts` must force `ttlOneHour()` — never trust the caller.
4. **Bake artefact copy into `bun run compile`.** `compact compile` → copy `keys/`, `zkir/`, `contract/` into `public/contract/` in one script; the browser silently drifts otherwise.
5. **Pin every Docker tag.** `latest` doesn't exist for `midnight-node`, and the partner-chain 2.x tags don't run standalone. `0.22.5` / `4.0.2` / `8.0.3` is the current known-good triple.
6. **Fail fast on a crash-looping node** — probe `docker inspect` health before the 15 s sync wait, or you'll spend 95 s per failed attempt discovering the container never came up.
7. **On TanStack Start, disable Nitro for Midnight routes.** Don't try to make workerd SSR happy with WASM + TLA + Buffer — it won't be.

## Anti-patterns

- Don't call `initialAPI.connect(...)` without `setNetworkId(...)` first.
- Don't store the 32-byte witness secret on the server or in a cookie — localStorage only.
- Don't pretend a public ledger commitment is private. It's public. Only the witness stays hidden.
- Don't run the write path under SSR / `build:dev` prerender.
- Don't deploy from a Cloudflare Worker / TanStack server function — no Docker, no proof server, no localhost. Deploys are a local `bun` script.
- Don't accept a user's recovery phrase in chat.
- Don't derive unshielded and shielded addresses through different `NetworkId` values.
- Don't assume Node scripts under `scripts/` inherit Vite's dep resolution — every import must be `bun add`-ed.
- Don't try to skip the retry loop around `deployContract` on a fresh local chain — the wallet sync race is real.
- Don't use `withVacantWitnesses` for a contract that declares any witnesses; supply the object explicitly.

## Cross-references

- Fly.io hosting for the node/indexer/proof-server (when a laptop can't run Docker): see the `canton-fly-deploy` skill for the flyctl pattern; adapt image names to Midnight's.
- One-time toolchain install (Compact compiler, Docker Desktop, VS Code extension): see `midnight-environment-setup`.
- Just the wallet-connect UI without contracts: see `react-wallet-connector`.
