## Diagnosis

Deploy tx is rejected by the node with `1010: Invalid Transaction: Custom error: 171`. That's a runtime-level rejection (not a proving or balancing failure) — the tx was built, proved, and balanced fine, then the node refused it at the mempool.

On Midnight's standalone node, `Custom error: 171` in practice means the transaction's TTL window doesn't line up with the node's current block time. Two things line up with that:

1. The node was just started this run (`Up 6 seconds` when the deploy began), so its wall clock / block time is still catching up to genesis timestamps.
2. We only wait 15s after `wallet.start()` before deploying. The wallet sync log shows the WS actually disconnected/reconnected twice during that window, so the wallet's view of "current tip" is stale — it stamps `ttlOneHour()` relative to an old block, and by the time the node sees the tx the TTL is already invalid.

It "worked before" because on earlier runs the containers had been up longer, so tip time and wallet time agreed. Nothing in `contract.compact`, the deploy script's crypto, or the Docker images actually changed.

## Fix plan

Edit only `scripts/deploy-midnight.mjs`:

1. **Wait for the node to produce blocks before touching the wallet.** After `waitForService` for the indexer, poll the indexer's GraphQL for `block { height }` until height ≥ 2 (or timeout 60s). This guarantees the chain is actually advancing, not just that the HTTP port is open.

2. **Wait for wallet sync to reach the tip, not a fixed 15s.** Replace the `await setTimeout(15_000)` with a loop that reads `wallet.state()` (RxJS observable → take 1) and waits until `syncProgress.synced === true` AND a non-zero dust balance is visible, with a 90s cap. Log progress each iteration.

3. **Retry on `Custom error: 171` the same way we retry on `Insufficient Funds`.** In the existing 8-attempt `deployContract` loop, also catch messages containing `Custom error: 171`, `Invalid Transaction`, or `Transaction submission error`, sleep 10s, and retry — each retry rebuilds the tx against a fresher tip so the TTL becomes valid.

4. **Shrink the TTL margin.** `ttlOneHour()` is fine, but also bump `feeBlocksMargin` from 5 → 15 in the wallet builder so balancing accounts for more slippage while the node is still warming.

No frontend, contract, Docker, or Vite changes. After this, `bun run compile` should get past deployment on a cold `docker compose up`.

## Technical detail

- Block-height poll: `POST http://localhost:8088/api/v4/graphql` with `{ query: "{ block { height } }" }`, parse `data.block.height`.
- Wallet-state read: `import { firstValueFrom } from "rxjs"; const s = await firstValueFrom(wallet.state());` then check `s.syncProgress?.synced` and `s.balances`.
- Retry classifier: `if (/Custom error: 171|Invalid Transaction|Transaction submission error|Insufficient Funds/.test(msg) && attempt < maxAttempts)`.
