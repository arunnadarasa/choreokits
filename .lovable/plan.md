## Problem
`bun run compile` starts the Docker stack, but `midnight-node` enters a restart loop. The deploy script hangs waiting for the indexer, which cannot index a dead node.

## Plan

1. **Diagnose the crash**
   - User runs `docker compose logs --tail=60 node` and pastes the output.
   - Likely causes to check:
     - Image architecture mismatch on Apple Silicon (amd64-only image).
     - Deprecated Substrate flags (`--ws-external`, `--rpc-methods=unsafe` removed in newer node builds).
     - Bad/yanked `2.0.0-rc.4` tag.

2. **Fix `docker-compose.yml`**
   - If flags are rejected: remove/replace deprecated flags and keep `--dev --rpc-external --rpc-cors=all --base-path=/data`.
   - If architecture mismatch: switch to an arm64-compatible tag (e.g. `latest-main` or an explicit `-arm64` suffix).
   - If tag is bad: fall back to a rolling dev tag documented by upstream.
   - Keep `proof-server:latest` and `indexer-standalone:4.3.3` unless logs show they also fail.

3. **Update README only if needed**
   - If the working node tag or command changes, update the "Image tags" section and the step-by-step Docker commands.
   - Add a short "Troubleshooting" note about the restart-loop symptom and the diagnostic log command.

4. **Verify**
   - Run `docker compose down -v` to wipe the broken state.
   - Run `bun run compile` end-to-end.
   - Confirm all three containers show `Up` in `docker compose ps` and the deploy script reaches `bun run dev`.

## What I need from you
Please paste the output of:
```bash
docker compose logs --tail=60 node
```
That will tell us exactly why the node is restarting.