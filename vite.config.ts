// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [wasm(), topLevelAwait()],
    build: { target: "esnext" },
    resolve: {
      conditions: ["browser", "import", "default"],
    },
    ssr: {
      resolve: {
        conditions: ["browser", "node", "import", "default"],
      },
    },
    optimizeDeps: {
      esbuildOptions: { target: "esnext", supported: { "top-level-await": true } },
      include: ["@midnight-ntwrk/compact-runtime"],
      exclude: [
        "@midnight-ntwrk/onchain-runtime-v3",
        "@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm",
      ],
    },
  },
});
