import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

async function boot() {
  const { Buffer } = await import("buffer");
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}

boot().catch((error) => {
  console.error("[client] boot failed:", error);
  throw error;
});
