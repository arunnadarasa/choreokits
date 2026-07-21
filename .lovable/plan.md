# Get unstuck — Docker-focused local Midnight stack

Two real problems in your terminal output, plus one doc bug in the README:

1. **`No default compiler set`** — the `compact` CLI is a version manager. It installed itself, but no `compactc` binary is on disk yet. Fix: run `compact update`. (Your `source ~/.bashrc` line silently failed because macOS zsh uses `~/.zshrc`, so `compact update` never ran.)
2. **`Module not found "scripts/midnight-standalone.mjs"`** — that file was referenced in the README but never committed. We'll replace it with a proper `docker-compose.yml` (node + indexer + proof-server), which is what you actually want anyway on a Mac with Docker Desktop.
3. `cp` errors are just downstream of #1 — once `compact compile` succeeds, `contracts/managed/tokenized-choreo-kits/{keys,zkir}` exist and the copies work.

## What you'll run after this plan lands

```bash
# 1. Fix the compiler (one-time)
compact update
compact --version   # expect a version, not "No default compiler set"

# 2. Compile the contract + copy ZK assets into public/
compact compile contracts/TokenizedChoreoKits.compact contracts/managed/tokenized-choreo-kits
cp -r contracts/managed/tokenized-choreo-kits/keys public/keys
cp -r contracts/managed/tokenized-choreo-kits/zkir public/zkir

# 3. Bring up the local Midnight stack with Docker
docker compose up -d          # pulls ~1 GB first time
docker compose ps             # all three containers "Up"
docker compose logs -f proof-server   # Ctrl+C to detach

# 4. Point Lace at the local node
#    Lace → Settings → Network → Custom → ws://localhost:9944
#    Genesis wallet is pre-funded with unlimited tDUST (no faucet).

# 5. Run the app
cp .env.example .env
bun install
bun dev
```

Teardown when you're done: `docker compose down` (add `-v` to also wipe the node's chain data volume).

## Files this plan will create / change

### 1. `docker-compose.yml` (new, at repo root)

Three services on one Docker network, matching the ports already in `.env.example`:

```yaml
services:
  proof-server:
    image: midnightntwrk/proof-server:latest
    command: midnight-proof-server -v
    ports: ["6300:6300"]
    restart: unless-stopped

  node:
    image: midnightntwrk/midnight-node:latest    # standalone dev chain
    command: ["--dev", "--rpc-external", "--ws-external", "--rpc-cors=all"]
    ports: ["9944:9944", "9933:9933"]
    volumes: ["midnight-node-data:/data"]
    restart: unless-stopped

  indexer:
    image: midnightntwrk/indexer-standalone:latest
    environment:
      - NODE_WS_URL=ws://node:9944
    depends_on: [node]
    ports: ["8088:8088"]
    restart: unless-stopped

volumes:
  midnight-node-data:
```

Exact image tags and env var names will be verified against `https://docs.midnight.network/llms-full.txt` during the build step — if the current standalone image publishes different names, the compose file will use those. The port mapping (`6300`, `9944`, `8088`) is fixed because `.env.example` already targets those.

### 2. `scripts/midnight-stack.sh` (new, thin wrapper)

Just a convenience shim so the README's `up` / `down` / `logs` verbs still work without needing a Node script:

```bash
#!/usr/bin/env bash
case "$1" in
  up)    docker compose up -d ;;
  down)  docker compose down ;;
  logs)  docker compose logs -f "${2:-}" ;;
  ps)    docker compose ps ;;
  *)     echo "usage: $0 {up|down|logs [service]|ps}"; exit 1 ;;
esac
```

Made executable via `chmod +x`.

### 3. `README.md` (edit — Docker-focused setup section)

Replace the current "One-time local setup" block with the exact 5 commands above, plus:
- A note that `source ~/.bashrc` should be `source ~/.zshrc` on macOS (or just skip it and run `compact update` directly — the installer already adds `~/.local/bin` to PATH).
- A "Docker lifecycle" cheat sheet (`up`, `down`, `logs proof-server`, `ps`, `down -v` to reset chain).
- Removal of every reference to `scripts/midnight-standalone.mjs`.

### 4. `.env.example` — no change

Already correct (`localhost:6300`, `localhost:8088`, `localhost:9944`).

## What I will NOT touch

- Any component under `src/` — the wallet, deploy, publish, and feed UI already point at the right URLs.
- The Compact contract itself.
- `vite.config.ts`, TanStack routes, or the SSR wrapper.

## Verification before I hand it back

- `docker compose config` parses cleanly.
- `README.md` no longer mentions the missing bun script.
- `scripts/midnight-stack.sh` is executable.

Approve and I'll switch to build mode and apply the three file changes.
