## Goal
Move the demo from "local-only staging" to a real end-to-end Midnight ZK flow: connect Lace → mint a kit on-chain with a ZK proof → see the kit decoded from the indexer.

## Current state
- The contract is deployed locally and the frontend now accepts the hex address.
- `PublishKitForm` only writes to `localStorage` and shows "Kit staged locally".
- `KitFeed` only shows localStorage entries and raw hex chain state.
- `src/lib/contract.ts` does not exist; the compiled contract artifacts are not present in this checkout (`contracts/managed/tokenized-choreo-kits` is missing).
- `useMidnightWallet` exposes the address but not the connected Lace `ConnectedAPI`, so we can't build MidnightJS providers for transactions.

## Plan

### 1. Compile the contract and expose ZK assets
- Run `bun run midnight:compile` to generate `contracts/managed/tokenized-choreo-kits` and copy `keys/` and `zkir/` into `public/`.
- This is a prerequisite for every subsequent step.

### 2. Create `src/lib/contract.ts` (client-only contract wrapper)
- Dynamically import `@midnight-ntwrk/midnight-js-contracts` and the compiled contract from `contracts/managed/tokenized-choreo-kits/contract/index.cjs`.
- Provide a deterministic 32-byte `localSecretKey` witness stored in `localStorage` (generate once with `crypto.getRandomValues`).
- Build a `CompiledContract` with `withWitnesses` and `withCompiledFileAssets` (browser path: `/zkir` and `/keys` from `public/`).
- Expose `publishKit(api, contractAddress, payload)` that:
  - Creates providers from the connected Lace API (`httpClientProofProvider`, `indexerPublicDataProvider`, `FetchZkConfigProvider`, `levelPrivateStateProvider`).
  - Calls `createContractInstance` or `findContract` to get a callable contract.
  - Invokes the `publishKit` circuit with the JSON payload as `Opaque<"string">`.
  - Returns the tx hash and waits for indexer confirmation.

### 3. Update `src/lib/use-midnight-wallet.ts`
- Keep the existing address/network state.
- Also expose the raw `ConnectedAPI` object returned by `wallet.connect()` so downstream code can pass it to the provider builder.

### 4. Update `src/components/PublishKitForm.tsx`
- Accept the connected Lace API as a prop.
- Replace the localStorage-only simulation with a real call to `publishKit(...)` from `src/lib/contract.ts`.
- Keep the localStorage fallback as a temporary optimistic entry so the UI feels instant, but mark it "pending" until the indexer confirms.
- Keep the existing `Proving… 30–120s` UX and error handling.

### 5. Update `src/components/KitFeed.tsx`
- Import the compiled contract's `ledger(state)` decoder.
- When raw chain state arrives, decode it into `{ kit_count, last_kit, last_author_commitment }`.
- Parse `last_kit` as JSON and merge it with localStorage entries, showing on-chain entries with a distinct badge.
- Keep the raw hex state behind the existing collapsible section for demo/debugging.

### 6. Update `src/routes/index.tsx`
- Pass the connected Lace API from `WalletConnectPanel` / `useMidnightWallet` down to `PublishKitForm`.

### 7. Verify end-to-end
- Re-run `bun run compile` (compile + stack up + deploy + dev).
- Connect Lace to `ws://localhost:9944`.
- Publish a kit and confirm:
  - The button shows real proving time.
  - The feed shows the new kit as "chain" after indexer sync.
  - The raw chain state hex updates.

## Out of scope
- No resale/transfer logic.
- No IPFS/Pinata.
- No AI Gateway integration.
- No tests or CI.

## Files to change/create
- Create: `src/lib/contract.ts`
- Modify: `src/lib/use-midnight-wallet.ts`
- Modify: `src/components/PublishKitForm.tsx`
- Modify: `src/components/KitFeed.tsx`
- Modify: `src/routes/index.tsx`
- Possibly modify: `README.md` if the flow changes meaningfully.

## Commands the user will run after implementation
```bash
bun run compile
```
Then open the preview, connect Lace, and mint a kit.