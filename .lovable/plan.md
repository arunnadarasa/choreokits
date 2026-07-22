## Root cause

`src/routes/api/mint.ts` has `import { publishKitLocal } from "@/lib/mint.server"` at the top of the file. TanStack's generated `routeTree.gen.ts` imports every route module — including `api/mint.ts` — into the client bundle. That drags `mint.server.ts` (which imports `node:path`, `node:url`, `ws`, and `@midnight-ntwrk/*` for Node) into the browser. Module evaluation throws before hydration, so the page stays blank while the console only shows unrelated MetaMask extension noise.

The Vite `midnightSsrStub` plugin only rewrites imports during `command === "build"` and only for the SSR pass — it doesn't help the dev client bundle at all.

## Fix

Move the server-only import inside the handler so the client bundle never resolves it:

```ts
// src/routes/api/mint.ts
export const Route = createFileRoute("/api/mint")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { publishKitLocal } = await import("@/lib/mint.server");
        // ... existing body/validation/response ...
      },
    },
  },
});
```

Additionally, guard `mint.server.ts` against ever being pulled into a browser bundle by adding a top-level runtime assertion (`if (typeof window !== "undefined") throw ...`) so a future regression fails loudly instead of blanking the UI.

## Verification

1. `curl http://localhost:8080/` — HTML still returns.
2. Open the app in the browser — Header, wallet panel, deploy panel, publish form, and kit feed render.
3. `curl -X POST http://localhost:8080/api/mint -H 'content-type: application/json' -d '{}'` — still returns the 400 JSON.
4. Trigger an actual mint end-to-end on the local Undeployed stack to confirm the dynamic import path still reaches the Fluent wallet.

## Scope

Only touches `src/routes/api/mint.ts` and adds a defensive guard to `src/lib/mint.server.ts`. No UI, contract, or wallet logic changes.