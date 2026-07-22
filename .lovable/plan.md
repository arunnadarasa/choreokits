## Diagnosis (confirmed)

Lace shows `0 / 0 tDUST · tDUST Tank Empty`. The `publishKit` proof succeeds (you saw the Lace "Prove transaction" dialog with a real proof + binding_commitment), but Lace can't pay fees on submit, so `submitTransaction` rejects with the opaque scoped-transaction error. The Compact contract, ZK stack, and `balanceTx`/`submitTx` adapters are fine — the wallet is unfunded.

## Fix in three parts

### 1. Fund Lace with tNIGHT using midnight-local-dev (5 min, one-time)

Add `scripts/fund-lace.sh` documenting the exact commands:

```bash
# In a second terminal, alongside our docker-compose stack:
git clone https://github.com/midnightntwrk/midnight-local-dev.git /tmp/midnight-local-dev
cd /tmp/midnight-local-dev
npm install
npm start
# Menu → 2  (Fund accounts by public key)
# Paste your Lace UNSHIELDED address (mn_addr_undeployed1...)
```

Wallet receives 50,000 tNIGHT. Then in Lace: **Generate tDUST** on that tNIGHT to start dust generation. After ~1 block the "tDUST Tank Empty" chip flips to a live balance.

Caveat: `midnight-local-dev` boots its own node/indexer/proof-server on the same ports we use. Two options, both documented in the README:
- **Option A (simpler for tonight):** stop our `docker compose` stack, run midnight-local-dev's stack instead, fund Lace, then swap back. Chain state is per-container so we redeploy the contract afterwards — that's already automated by `bun run compile`.
- **Option B (cleaner):** run only midnight-local-dev's funding CLI against our running node by pointing its RPC/indexer envs at `ws://localhost:9944` / `http://localhost:8088`. I'll add a helper script that sets those env vars before `npm start`.

### 2. Surface dust status in the UI so this never happens silently again

Edit `src/lib/use-midnight-wallet.ts` to also read on connect:
- `getDustBalance()` → `{ cap, balance }`
- `getDustAddress()` → `dustAddress`
- `getUnshieldedAddress()` → the address to paste into the faucet

Edit `src/components/WalletConnectPanel.tsx` to render:
- Dust balance / cap chip (green if `balance > 0`, red "tDUST Tank Empty" otherwise)
- The unshielded address with a copy button, plus a one-line "Fund with midnight-local-dev → menu option 2" hint
- Link to the Lace "Generate tDUST" flow

Edit `src/components/PublishKitForm.tsx` to disable Mint when `dust.balance <= 0n` with the message "Fund Lace with tNIGHT and generate tDUST first (see step 01)".

### 3. Better error surfacing in the submit adapter

In `src/lib/contract.ts` `LaceMidnightProvider.submitTx`, when Lace throws the scoped-transaction error, check the connected wallet's current `getDustBalance()` and if it's zero throw:

> "Lace couldn't submit: your dust tank is empty. Fund tNIGHT via midnight-local-dev (menu → 2) and click 'Generate tDUST' in Lace, then retry."

Keep the existing "already/duplicate/known" short-circuit that returns `tx.transactionHash()`.

### 4. README update

Add a "Funding Lace (Undeployed)" section right under the quick-start with the 3 commands above and a screenshot placeholder. Mention this is a one-time-per-fresh-chain step; after `docker compose down -v` the funding must be redone.

## What we do NOT change

- `LaceWalletProvider.balanceTx` — the current `Transaction.deserialize("signature","proof","binding", bytes)` path is correct for a Lace-sealed tx.
- The Compact contract.
- Deploy script.

## Expected result

After funding (~2 min) Lace shows a non-zero tDUST balance, the UI shows a green dust chip, Mint enables, Lace proves once, submit returns a tx id, and the Kit Feed's "chain · synced" row updates from the indexer.

## Answer to your question

- **`midnightntwrk/midnight-wallet`** — this is the wallet-SDK monorepo. Useful reference for `registerNightUtxosForDustGeneration` if we ever want to skip Lace's UI and register from our app, but not needed tonight.
- **`midnightntwrk/midnight-dapp-connector-api`** — this is the same `@midnight-ntwrk/dapp-connector-api` package we already use. No change.
- **`midnightntwrk/midnight-wallet-dapp`** — reference dApp; good for cross-checking our balance/submit flow but nothing to import.
- **`midnightntwrk/midnight-local-dev`** — this is the one that unblocks you. Its interactive CLI is exactly the faucet we're missing.