import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/api/mint")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            contractAddress?: string;
            title?: string;
            steps?: string;
            priceDust?: number;
          };
          if (!body.contractAddress || !body.title || !body.steps) {
            return new Response(
              JSON.stringify({ error: "contractAddress, title, steps required" }),
              { status: 400, headers: { "content-type": "application/json" } },
            );
          }
          const { publishKitLocal } = await import("@/lib/mint.server");
          const result = await publishKitLocal(
            body.contractAddress,
            body.title,
            body.steps,
            Number(body.priceDust) || 0,
          );
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[api/mint] failed:", e);
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
