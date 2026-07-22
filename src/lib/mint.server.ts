// Server-only. Reuses the same in-process wallet the deploy script uses.
// This is the ONLY way to mint on the Undeployed local chain, because
// Lace cannot balance/sign transactions for `undeployed` (per Midnight docs).
//
// Runs inside the TanStack Start dev server (Node). The Cloudflare Worker
// build swaps this module for src/lib/mint.ssr-stub.ts (see vite.config.ts).

import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { firstValueFrom } from "rxjs";
import { WebSocket } from "ws";

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { FluentWalletBuilder } from "@midnight-ntwrk/testkit-js";
import {
  LedgerParameters,
  ZswapSecretKeys,
  DustSecretKey,
} from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { ttlOneHour } from "@midnight-ntwrk/midnight-js-utils";

(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

const NETWORK_ID = process.env.VITE_NETWORK_ID ?? "undeployed";
const NODE_WS = process.env.VITE_NODE_WS ?? "ws://localhost:9944";
const NODE_HTTP = NODE_WS.replace("ws://", "http://").replace("wss://", "https://");
const INDEXER_URL = process.env.VITE_INDEXER_URL ?? "http://localhost:8088/api/v4/graphql";
const INDEXER_WS_URL = process.env.VITE_INDEXER_WS_URL ?? "ws://localhost:8088/api/v4/graphql/ws";
const PROOF_SERVER_URL = process.env.VITE_PROOF_SERVER_URL ?? "http://localhost:6300";

const ALICE_LOCAL_SEED = "0000000000000000000000000000000000000000000000000000000000000002";

const ZK_CONFIG_PATH = path.resolve(process.cwd(), "contracts", "managed", "tokenized-choreo-kits");

type WalletCtx = {
  wallet: any;
  zswapSecretKeys: any;
  dustSecretKey: any;
  coinPublicKey: string;
  providersBase: any;
  deployerSecret: Uint8Array;
};

let walletPromise: Promise<WalletCtx> | null = null;

async function waitForWalletReady(wallet: any, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const state = await firstValueFrom(wallet.state());
      const synced = state?.syncProgress?.synced === true;
      const hasDust = Object.values(state?.balances ?? {}).some((v: any) => {
        try {
          return BigInt(v) > 0n;
        } catch {
          return false;
        }
      });
      if (synced && hasDust) return;
    } catch {
      /* wait */
    }
    await sleep(2_000);
  }
}

async function buildWallet(): Promise<WalletCtx> {
  setNetworkId(NETWORK_ID);
  console.log("[mint] Building local Fluent wallet from genesis seed…");

  const envConfig = {
    walletNetworkId: NETWORK_ID,
    networkId: NETWORK_ID,
    indexer: INDEXER_URL,
    indexerWS: INDEXER_WS_URL,
    node: NODE_HTTP,
    nodeWS: NODE_WS,
    proofServer: PROOF_SERVER_URL,
  };

  const built = await FluentWalletBuilder.forEnvironment(envConfig as any)
    .withSeed(ALICE_LOCAL_SEED)
    .withDustOptions({
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 15,
    })
    .buildWithoutStarting();

  const wallet = built.wallet;
  const seeds = built.seeds;
  const zswapSecretKeys = ZswapSecretKeys.fromSeed(seeds.shielded);
  const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);

  await wallet.start(zswapSecretKeys, dustSecretKey);
  await waitForWalletReady(wallet, 90_000);

  const coinPublicKey = zswapSecretKeys.coinPublicKey;
  const deployerSecret = crypto.getRandomValues(new Uint8Array(32));

  const providersBase = {
    publicDataProvider: indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL),
    walletProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => zswapSecretKeys.encryptionPublicKey,
      balanceTx: async (tx: any) => {
        const ttl = ttlOneHour();
        const recipe = await wallet.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
          { ttl },
        );
        return wallet.finalizeRecipe(recipe);
      },
      submitTx: (tx: any) => wallet.submitTransaction(tx),
    },
    midnightProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => zswapSecretKeys.encryptionPublicKey,
      balanceTx: async (tx: any) => {
        const ttl = ttlOneHour();
        const recipe = await wallet.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
          { ttl },
        );
        return wallet.finalizeRecipe(recipe);
      },
      submitTx: (tx: any) => wallet.submitTransaction(tx),
    },
  };

  console.log("[mint] Wallet ready.");
  return { wallet, zswapSecretKeys, dustSecretKey, coinPublicKey, providersBase, deployerSecret };
}

function getWallet(): Promise<WalletCtx> {
  if (!walletPromise) walletPromise = buildWallet().catch((e) => {
    walletPromise = null;
    throw e;
  });
  return walletPromise;
}

export async function publishKitLocal(
  contractAddress: string,
  title: string,
  steps: string,
  priceDust: number,
): Promise<{ txId: string }> {
  const ctx = await getWallet();
  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);
  const privateStateId = `choreo-kits-mint-${ctx.coinPublicKey.slice(0, 12)}`;
  const providers = {
    ...ctx.providersBase,
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `choreo-kits-mint`,
      privateStoragePasswordProvider: () => "Choreo-Kits-Local-2026!",
      accountId: ctx.coinPublicKey,
    }),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER_URL, zkConfigProvider),
  };

  const { Contract } = await import(
    /* @vite-ignore */
    path.resolve(ZK_CONFIG_PATH, "contract", "index.js") as unknown as string
  ).catch(async () => {
    // Vite dev may need file:// url
    const { pathToFileURL } = await import("node:url");
    return import(pathToFileURL(path.join(ZK_CONFIG_PATH, "contract", "index.js")).href);
  });
  const { CompiledContract } = await import(
    "@midnight-ntwrk/midnight-js-protocol/compact-js"
  );

  const witnesses = {
    localSecretKey: (c: any) => {
      const sk = c?.privateState?.localSecretKey ?? ctx.deployerSecret;
      return [{ ...(c?.privateState ?? {}), localSecretKey: sk }, sk];
    },
  };

  const compiledContract = (CompiledContract as any).make(
    "TokenizedChoreoKitsContract",
    Contract,
  ).pipe(
    (self: any) => (CompiledContract as any).withWitnesses(self, witnesses),
    (CompiledContract as any).withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  // Ensure private state exists.
  await providers.privateStateProvider.setContractAddress?.(contractAddress);
  const existing = await providers.privateStateProvider.get(privateStateId);
  if (!existing) {
    await providers.privateStateProvider.set(privateStateId, {
      localSecretKey: ctx.deployerSecret,
    });
  }

  const deployed = await findDeployedContract(providers as any, {
    compiledContract,
    contractAddress,
    privateStateId,
  } as any);

  const payload = JSON.stringify({
    title: title.trim(),
    steps: steps.trim(),
    priceDust,
    publishedAt: new Date().toISOString(),
  });

  console.log(`[mint] Calling publishKit on ${contractAddress}…`);
  const result = await (deployed as any).callTx.publishKit(payload);
  const txId = result?.public?.txId ?? result?.txId ?? "unknown";
  console.log(`[mint] Success. tx=${txId}`);
  return { txId };
}
