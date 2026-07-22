## Update `lovable-midnight` skill: cold-start proof timing

Add the lesson from tonight's 224s "Proving…" scare so future agents warn users up front instead of debugging a non-bug.

### Edit 1 — replace line 27 (Non-negotiables, proof timing bullet)

Replace the current one-liner:

> Proofs on medium circuits (`k=14`) take **30–120s** on the local proof server (first proof is slowest; warm proofs are seconds). Every write UI must show a `Proving…` state and stay usable.

with an expanded bullet covering:

- k=13/k=14 (~4k–8k rows) → **30–120s warm**, **up to ~4 min cold** on a laptop
- First call after `docker compose up` loads the proving key (hundreds of MB) into RAM + JITs the WASM runtime → cold path is dominated by this, not the circuit
- One user "Mint" can trigger **two proofs back-to-back**: app-side `midnight-js-contracts` prove, then Lace's own re-prove of the balanced tx before signing
- UI must show "up to ~4 min on first mint" hint; no spinner timeout under 5 min
- To demo on video: run one warm-up mint off-camera first — warm proofs drop to ~30–60s
- macOS Docker Desktop adds ~20–30% overhead vs native Linux (Linux VM)

### Edit 2 — update the matching row in "Failure modes ranked by frequency"

Change:

> | Proof hangs 30–120 s on first call | First warm-up after container boot | Expected; show a `Proving…` state |

to reflect the true cold-start ceiling (~4 min) and the double-prove (app + Lace), pointing at the same guidance.

### Apply

Run `skills--apply_draft` on `.agents/skills/lovable-midnight` so the update goes live.

No other files touched. No app code changes.