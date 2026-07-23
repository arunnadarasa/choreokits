// Server-only. Reuses the same in-process Fluent wallet pattern as
// scripts/deploy-midnight.mjs. This is the ONLY way to mint on the
// local Undeployed chain: Lace cannot balance/sign undeployed txs.
if (typeof window !== "undefined") {
  throw new Error("mint.server.ts must never be imported in the browser bundle");
}

import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { firstValueFrom } from "rxjs";
// @ts-expect-error - ws has no bundled types in this project
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
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";

(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

const NETWORK_ID = process.env.VITE_NETWORK_ID ?? "undeployed";
const NODE_WS = process.env.VITE_NODE_WS ?? "ws://localhost:9944";
const NODE_HTTP = NODE_WS.replace(/^ws/, "http");
const INDEXER_URL = process.env.VITE_INDEXER_URL ?? "http://localhost:8088/api/v4/graphql";
const INDEXER_WS_URL = process.env.VITE_INDEXER_WS_URL ?? "ws://localhost:8088/api/v4/graphql/ws";
const PROOF_SERVER_URL = process.env.VITE_PROOF_SERVER_URL ?? "http://localhost:6300";

const ALICE_LOCAL_SEED = "0000000000000000000000000000000000000000000000000000000000000002";
const ZK_CONFIG_PATH = path.resolve(process.cwd(), "contracts", "managed", "tokenized-choreo-kits");

type WalletCtx = {
  wallet: any;
  coinPublicKey: string;
  zswapSecretKeys: any;
  dustSecretKey: any;
  deployerSecret: Uint8Array;
  providers: any;
  compiledContract: any;
};

let ctxPromise: Promise<WalletCtx> | null = null;

async function waitForWalletReady(wallet: any, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const state = (await firstValueFrom(wallet.state())) as any;
      const synced = state?.syncProgress?.synced === true;
      const hasDust = Object.values(state?.balances ?? {}).some((v: any) => {
        try { return BigInt(v as any) > 0n; } catch { return false; }
      });
      if (synced && hasDust) return;
    } catch {}
    await sleep(2_000);
  }
}

async function build(): Promise<WalletCtx> {
  if (NETWORK_ID !== "undeployed") {
    throw new Error(`/api/mint is only supported on undeployed (got ${NETWORK_ID}).`);
  }
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

  const { wallet, seeds } = built as any;
  const zswapSecretKeys = ZswapSecretKeys.fromSeed(seeds.shielded);
  const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);

  await wallet.start(zswapSecretKeys, dustSecretKey);
  await waitForWalletReady(wallet, 90_000);

  const coinPublicKey = (zswapSecretKeys as any).coinPublicKey;
  const deployerSecret = crypto.getRandomValues(new Uint8Array(32));

  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);
  const balanceTx = async (tx: any) => {
    const ttl = ttlOneHour();
    const recipe = await wallet.balanceUnboundTransaction(
      tx,
      { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
      { ttl },
    );
    return wallet.finalizeRecipe(recipe);
  };
  const submitTx = (tx: any) => wallet.submitTransaction(tx);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `choreo-kits-mint`,
      privateStoragePasswordProvider: () => "Choreo-Kits-Local-2026!",
      accountId: coinPublicKey,
    } as any),
    publicDataProvider: indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER_URL, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => (zswapSecretKeys as any).encryptionPublicKey,
      balanceTx,
      submitTx,
    },
    midnightProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => (zswapSecretKeys as any).encryptionPublicKey,
      balanceTx,
      submitTx,
    },
  };

  const { Contract } = await import(
    /* @vite-ignore */
    pathToFileURL(path.join(ZK_CONFIG_PATH, "contract", "index.js")).href
  );

  const witnesses = {
    localSecretKey: (c: any) => {
      const sk = c?.privateState?.localSecretKey ?? deployerSecret;
      return [{ ...(c?.privateState ?? {}), localSecretKey: sk }, sk];
    },
  };

  const compiledContract = (CompiledContract as any)
    .make("TokenizedChoreoKitsContract", Contract)
    .pipe(
      (self: any) => (CompiledContract as any).withWitnesses(self, witnesses),
      (CompiledContract as any).withCompiledFileAssets(ZK_CONFIG_PATH),
    );

  console.log("[mint] Wallet + contract ready.");
  return {
    wallet,
    coinPublicKey,
    zswapSecretKeys,
    dustSecretKey,
    deployerSecret,
    providers,
    compiledContract,
  };
}

function getCtx() {
  if (!ctxPromise) {
    ctxPromise = build().catch((e) => {
      ctxPromise = null;
      throw e;
    });
  }
  return ctxPromise;
}

export async function publishKitLocal(
  contractAddress: string,
  title: string,
  steps: string,
  priceDust: number,
): Promise<{ txId: string }> {
  const ctx = await getCtx();
  const privateStateId = `choreo-kits-mint-${contractAddress.slice(0, 12)}`;

  // CRITICAL: bind the contract address on the private state provider BEFORE any
  // get/set. Otherwise the provider throws "Contract address not set. Call
  // setContractAddress()…" and the mint fails with a 500.
  if (typeof ctx.providers.privateStateProvider.setContractAddress === "function") {
    ctx.providers.privateStateProvider.setContractAddress(contractAddress);
  }

  // Ensure a private state row exists for this contract before calling findDeployedContract.
  const existing = await ctx.providers.privateStateProvider.get(privateStateId).catch(() => null);
  if (!existing) {
    await ctx.providers.privateStateProvider.set(privateStateId, {
      localSecretKey: ctx.deployerSecret,
    });
  }

  const deployed: any = await findDeployedContract(ctx.providers as any, {
    compiledContract: ctx.compiledContract,
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
  const result = await deployed.callTx.publishKit(payload);
  const txId =
    result?.public?.txHash ??
    result?.public?.txId ??
    result?.txId ??
    "submitted";
  console.log(`[mint] Success. tx=${txId}`);
  return { txId: String(txId) };
}
