## What's happening

- Local dev (`http://localhost:8080`) renders the app fine at both desktop and mobile viewports — no client errors.
- Preview URL (`id-preview--…lovable.app`) returns a normal 200 HTML shell.
- Published URL (`https://choreokits.lovable.app/`) returns **HTTP 500** with the exact HTML from `src/lib/error-page.ts` (`renderErrorPage()`).

That's the screenshot you're seeing on your phone — the "This page didn't load / Try again / Go home" page is our own SSR fallback from `src/server.ts`. It fires when the TanStack Start server entry throws or h3 swallows an error into a 500. Right now the wrapper logs the real error with `console.error`, but on the deployed Worker we can't read those logs from your phone, so we're flying blind.

## Root cause (hypothesis, not yet confirmed)

`vite.config.ts` sets `nitro: false`, but the published Worker is still executing an SSR entry that crashes on every request. Most likely the SSR module graph pulls in a browser-only Midnight/WASM import at module scope even though `/` is marked `ssr: false` — the route file is still evaluated during server module loading. Until we can see the actual error, this stays a hypothesis.

## Plan — make the error visible on your phone, then fix it

1. **Expose the captured error in the 500 response body** (temporary, debug-only).
   - Update `src/lib/error-page.ts` to accept an optional `details` string and render it inside a `<pre>` block below the buttons.
   - Update `src/server.ts` so both the `catch` branch and `normalizeCatastrophicSsrResponse` pass the captured error's `message + stack` into `renderErrorPage(details)`. Keep `console.error` too.
   - This gives you a readable stack trace directly on `https://choreokits.lovable.app/` from your phone.

2. **You publish**, reload the published URL on your phone, and paste the visible stack back to me.

3. **Fix the real error** based on what the trace shows. Most likely one of:
   - A Midnight/WASM module imported at SSR time → move behind a lazy `import()` inside a client-only boundary, or add it to the `midnightSsrStub` alias list in `vite.config.ts`.
   - `Buffer`/`window` touched during SSR → gate with `typeof window` or move into `useEffect`.
   - `nitro: false` not being honoured by `@lovable.dev/vite-tanstack-config` → if that's the case, we can instead make the SSR entry render just the shell (skip route rendering) so the client bundle takes over.

4. **Remove the debug `details` output** once the underlying error is fixed, so we don't leak stack traces to end users.

## Files touched (step 1 only)

- `src/lib/error-page.ts` — add optional `details` parameter.
- `src/server.ts` — pass `error.stack ?? String(error)` into `renderErrorPage`.

No other files change until we see the trace.