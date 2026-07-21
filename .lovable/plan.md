## Root cause

`midnight-node:2.0.0-rc.4` is a **Partner Chain** build. It requires either a Cardano `db-sync` Postgres OR a `mock_registrations_file`. It is the wrong image for a standalone `--dev` Midnight chain — we've been fighting its config layer instead of using the image Midnight actually publishes for local dev.

## Fix — adopt the official `midnightntwrk/midnight-local-dev` stack

Replace our hand-rolled `docker-compose.yml` with the shape from the official `midnight-local-dev/standalone.yml` repo. That means changing three pinned images and switching from CLI flags to `CFG_PRESET=dev`, plus adding the required indexer env vars.

### 1. `docker-compose.yml`

- `proof-server`: `midnightntwrk/proof-server:8.0.3` (pinned; drop `:latest`)
- `node`: `midnightntwrk/midnight-node:0.22.5`
  - Drop all CLI args
  - Set `CFG_PRESET: dev` and `SIDECHAIN_BLOCK_BENEFICIARY: 04bcf7ad3be7a5c790460be82a713af570f22e0f801f6659ab8e84a52be6969e`
  - Healthcheck: `curl -f http://localhost:9944/health`
- `indexer`: `midnightntwrk/indexer-standalone:4.0.2`
  - `APP__INFRA__NODE__URL: ws://node:9944`
  - `APP__APPLICATION__NETWORK_ID: undeployed`
  - `APP__INFRA__STORAGE__PASSWORD`, `APP__INFRA__PUB_SUB__PASSWORD`, `APP__INFRA__LEDGER_STATE_STORAGE__PASSWORD`: `indexer`
  - `APP__INFRA__SECRET`: `303132333435363738393031323334353637383930313233343536373839303132`
  - `depends_on: node: condition: service_healthy`
- Keep the node data volume; drop the Partner-Chain env vars (`USE_MAIN_CHAIN_FOLLOWER_MOCK`, etc.).
- Keep `restart: "no"` on the node so crashes surface immediately.

### 2. `.env.example` + deploy script — Indexer path changes to v4

The official standalone indexer serves `/api/v4/graphql`, not v3.

- `.env.example`:
  - `VITE_INDEXER_URL=http://localhost:8088/api/v4/graphql`
  - `VITE_INDEXER_WS_URL=ws://localhost:8088/api/v4/graphql/ws`
- `scripts/deploy-midnight.mjs` default `INDEXER_URL` and `INDEXER_WS_URL` → v4.

### 3. `src/lib/*` — anywhere v3 is hardcoded

- Update any hardcoded `/api/v3/graphql` in the frontend (KitFeed poller, providers module) to v4.

### 4. `README.md`

- Update the "Image tags" section to list the new pins (`node:0.22.5`, `indexer-standalone:4.0.2`, `proof-server:8.0.3`) and mention that they come from the official `midnight-local-dev/standalone.yml`.
- Update the "Environment" section to show `/api/v4/graphql`.
- Refresh the Troubleshooting note: remove the mock-follower text, keep the fast-fail on `midnight-node` and the `docker compose down -v` reset step.

## Your steps after I apply the fix

```bash
docker compose down -v          # wipe old chain data
docker compose pull             # fetch the new pinned images (~1 GB)
bun run compile
```

If anything still fails, paste the fresh `docker compose logs --tail=80 node` (or indexer) and I'll patch from there.