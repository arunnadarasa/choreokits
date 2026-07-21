## Fix

Revert `proof-server` image to `midnightntwrk/proof-server:latest` in `docker-compose.yml` (the `4.0.0` tag I picked doesn't exist upstream — valid tags jump `8.x` → `9.0.0-rc.x`). Keep the pinned tags for `midnight-node:2.0.0-rc.4` and `indexer-standalone:4.3.3`. Update the README's "Image tags" section to match.

You don't need to delete the running `midnight-proof-server` container — it was pulled from `:latest` and Compose will re-adopt it.

## Steps

1. Edit `docker-compose.yml`: `proof-server:4.0.0` → `proof-server:latest`.
2. Edit `README.md` "Image tags" bullet accordingly.
3. Re-run `bun run compile`.
