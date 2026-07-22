// SSR/Cloudflare-build stub for src/lib/mint.server.ts.
// The published Worker cannot reach the local Docker stack anyway;
// this stub keeps the build green.
export async function publishKitLocal(
  _contractAddress: string,
  _title: string,
  _steps: string,
  _priceDust: number,
): Promise<{ txId: string }> {
  throw new Error(
    "Undeployed mint is only available in local dev mode with the Midnight Docker stack running.",
  );
}
