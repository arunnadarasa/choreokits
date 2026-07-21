## Root cause

`midnight-node:2.0.0-rc.4` is a Partner Chain build. On boot it validates:

```
db_sync_postgres_connection_string must be defined if ariadne is enabled
(i.e. if use_main_chain_follower_mock is false)
```

It's trying to connect to a Cardano `db-sync` Postgres because the "Ariadne" main-chain follower is enabled by default. For a local standalone `--dev` stack we don't have (or want) Cardano — we need the **mock main-chain follower** enabled.

## Fix

Update `docker-compose.yml` so the `node` service sets the mock follower env var (and a couple of companion vars the RC build expects), so the node boots cleanly without Postgres.

### Change (single file)

`docker-compose.yml` → `node` service, add under `environment:`:

```yaml
environment:
  USE_MAIN_CHAIN_FOLLOWER_MOCK: "true"
  SHOW_SECRETS: "1"        # so any remaining config error prints readable
  APP__MAIN_CHAIN_FOLLOWER_MOCK__ENABLED: "true"
```

Exact env var name may be `USE_MAIN_CHAIN_FOLLOWER_MOCK` (matches the error text). If the container still rejects it, the fallback is to pin to a non-Partner-Chain tag (e.g. `midnightntwrk/midnight-node:0.12.0` or `:latest-main`) which does not require Ariadne config. I'll try the env var first because it keeps the pinned image you already documented.

### Also

- Add `restart: "no"` on the node service so a crash surfaces immediately instead of Docker hiding it in a restart loop.
- `scripts/deploy-midnight.mjs`: before polling the indexer, check `docker inspect midnight-node --format '{{.State.Status}}'`. If it's `restarting` or `exited`, print `docker compose logs --tail=80 node` hint and exit fast (no more 120s hangs).
- README: add a short "Troubleshooting" note documenting the mock-follower env var and the fast-fail behavior.

## Your steps after I apply the fix

```bash
docker compose down -v
bun run compile
```

If the node still crashes with a different config error, paste the new `docker compose logs --tail=80 node` and I'll pivot to swapping the image tag.