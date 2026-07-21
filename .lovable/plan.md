## Problem

`docker compose up` failed because `midnightntwrk/midnight-node:latest` doesn't exist on Docker Hub — that repo publishes only versioned tags (e.g. `2.0.0-rc.4`, `latest-main`). `indexer-standalone` has `latest`, but pairing it with an unversioned node is fragile. Proof-server pulled fine (already running in your Docker Desktop screenshot).

## Fix

Pin all three services in `docker-compose.yml` to explicit, known-good tags that match Compact 0.23 / MidnightJS 4.1.x:

- `midnightntwrk/proof-server:4.0.0` (or keep `latest` — this one works)
- `midnightntwrk/midnight-node:2.0.0-rc.4`
- `midnightntwrk/indexer-standalone:4.3.3`

Update `README.md` to note that first `docker compose pull` may take a few minutes on the new tags.

## Steps

1. Edit `docker-compose.yml` — replace the three `image:` lines with pinned tags above.
2. Add a short "Image tags" note in `README.md` explaining why they're pinned (upstream doesn't publish `:latest` for the node).
3. You then re-run:
   ```
   docker compose pull
   bun run compile
   ```

## Notes

- Your proof-server container is already healthy on `:6300`, so only node + indexer need to come up.
- If `2.0.0-rc.4` node rejects the compiled contract (ledger version mismatch), fallback is `latest-main` (rolling dev tag) — I'll call that out in the README.
