// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import path from "node:path";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

/**
 * Midnight WASM packages only expose `browser` and `node` export conditions.
 * The Cloudflare workerd SSR resolver looks for `workerd`/`worker`/`wasm` and
 * fails. The home route is ssr:false, so we stub these out during the SSR
 * bundle pass; they are never executed server-side.
 */
function midnightSsrStub(): Plugin {
  const wasmStub = path.resolve("src/lib/midnight-ssr-stub.ts");
  const contractStub = path.resolve("src/lib/contract.ssr-stub.ts");
  return {
    name: "midnight-ssr-stub",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (!options?.ssr) return;
      if (id === "@/lib/contract") return contractStub;
      // Stub every Midnight SDK package during SSR — the home route is
      // ssr:false, so these are never executed server-side, but the bundler
      // still walks the import graph.
      if (id.startsWith("@midnight-ntwrk/")) return wasmStub;
    },
  };
}

export default defineConfig({
  // MidnightJS is client-only. The home route is `ssr: false` and
  // midnightSsrStub() below redirects the WASM packages to empty stubs during
  // the SSR pass, so nitro (Cloudflare workerd bundler) stays enabled to
  // produce a single inlined worker script.
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  vite: {
    plugins: [midnightSsrStub(), wasm(), topLevelAwait()],
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
