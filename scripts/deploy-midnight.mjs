#!/usr/bin/env node
// Deploy TokenizedChoreoKits to the local Undeployed Midnight stack.
// This script is meant to be invoked by `bun run compile`, but you can run it
// standalone once the Docker stack is up:
//
//   VITE_NETWORK_ID=undeployed bun scripts/deploy-midnight.mjs
//
// It writes the deployed contract address to `.env` as VITE_DEFAULT_CONTRACT so
// the dev server picks it up automatically.

import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { WebSocket } from "ws";

const execFileP = promisify(execFile);

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
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
import pino from "pino";

// GraphQL subscriptions need a WebSocket global in Node.
globalThis.WebSocket = WebSocket;

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: { target: "pino-pretty" },
});

// Local devnet genesis-mint wallet — pre-funded with tDUST on the standalone
// chain (see @midnight-ntwrk/testkit-js LocalTestEnvironment.genesisMintWalletSeed[0]).
const ALICE_LOCAL_SEED =
  "0000000000000000000000000000000000000000000000000000000000000002";


const NETWORK_ID = process.env.VITE_NETWORK_ID ?? "undeployed";
const NODE_WS = process.env.VITE_NODE_WS ?? "ws://localhost:9944";
const NODE_HTTP = NODE_WS.replace("ws://", "http://").replace("wss://", "https://");
const INDEXER_URL = process.env.VITE_INDEXER_URL ?? "http://localhost:8088/api/v4/graphql";
const INDEXER_WS_URL = process.env.VITE_INDEXER_WS_URL ?? "ws://localhost:8088/api/v4/graphql/ws";

const PROOF_SERVER_URL = process.env.VITE_PROOF_SERVER_URL ?? "http://localhost:6300";

const ZK_CONFIG_PATH = path.resolve(
  new URL(import.meta.url).pathname,
  "..",
  "..",
  "contracts",
  "managed",
  "tokenized-choreo-kits",
);


async function checkContainerHealthy(name) {
  try {
    const { stdout } = await execFileP("docker", [
      "inspect",
      name,
      "--format",
      "{{.State.Status}}",
    ]);
    const status = stdout.trim();
    if (status === "restarting" || status === "exited" || status === "dead") {
      throw new Error(
        `Container '${name}' is ${status}. Run:\n\n  docker compose logs --tail=80 ${name.replace(
          /^midnight-/,
          "",
        )}\n\nto see the crash reason.`,
      );
    }
  } catch (e) {
    if (e.message?.startsWith("Container ")) throw e;
    // docker not available or container missing — let waitForService handle it
  }
}

async function waitForService(url, name, timeoutMs = 120_000, containerName) {
  const start = Date.now();
  logger.info(`Waiting for ${name} at ${url}...`);
  while (Date.now() - start < timeoutMs) {
    if (containerName) await checkContainerHealthy(containerName);
    try {
      const resp = await fetch(url, { method: "POST", body: JSON.stringify({ query: "{ __typename }" }) });
      if (resp.status < 500) {
        logger.info(`${name} is ready.`);
        return;
      }
    } catch {
      // not ready yet
    }
    await setTimeout(1_000);
  }
  throw new Error(`${name} at ${url} did not become ready within ${timeoutMs}ms`);
}


async function main() {
  if (NETWORK_ID !== "undeployed") {
    throw new Error(
      `This script only supports the Undeployed local stack. Set VITE_NETWORK_ID=undeployed (got: ${NETWORK_ID}).`,
    );
  }

  setNetworkId(NETWORK_ID);

  // Make sure the compiled contract artifacts exist.
  try {
    await import("../contracts/managed/tokenized-choreo-kits/contract/index.js");
  } catch (e) {
    throw new Error(
      `Compiled contract not found at contracts/managed/tokenized-choreo-kits. Run 'bun run midnight:compile' first.\n${e}`,
    );
  }

  // Wait for the stack to be ready. Pass container names so we fail fast if
  // the node is crash-looping instead of waiting the full timeout.
  await waitForService(INDEXER_URL, "indexer", 120_000, "midnight-node");
  await waitForService(PROOF_SERVER_URL, "proof-server", 180_000, "midnight-proof-server");


  const envConfig = {
    walletNetworkId: NETWORK_ID,
    networkId: NETWORK_ID,
    indexer: INDEXER_URL,
    indexerWS: INDEXER_WS_URL,
    node: NODE_HTTP,
    nodeWS: NODE_WS,
    proofServer: PROOF_SERVER_URL,
  };

  // Build the local devnet wallet from the pre-funded genesis seed.
  logger.info("Building local devnet wallet from genesis seed...");
  const buildResult = await FluentWalletBuilder.forEnvironment(envConfig)
    .withSeed(ALICE_LOCAL_SEED)
    .withDustOptions({
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    })
    .buildWithoutStarting();

  const { wallet, seeds, keystore } = buildResult;
  const zswapSecretKeys = ZswapSecretKeys.fromSeed(seeds.shielded);
  const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);

  logger.info("Starting wallet sync...");
  await wallet.start(zswapSecretKeys, dustSecretKey);

  // Give the wallet a moment to catch up with genesis blocks so its dust UTXO
  // is visible before we try to balance the deploy tx.
  logger.info("Waiting for genesis dust to sync (up to 60s)...");
  await setTimeout(15_000);


  const coinPublicKey = zswapSecretKeys.coinPublicKey;
  const accountId = coinPublicKey;

  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);
  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `choreo-kits-deploy-${Date.now()}`,
      privateStoragePasswordProvider: () => "choreo-kits-local-password",
      accountId,
    }),
    publicDataProvider: indexerPublicDataProvider(INDEXER_URL, INDEXER_WS_URL),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER_URL, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => zswapSecretKeys.encryptionPublicKey,
      balanceTx: async (tx, ttl) => {
        const recipe = await wallet.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
          { ttl },
        );
        return wallet.finalizeRecipe(recipe);
      },
      submitTx: (tx) => wallet.submitTransaction(tx),
    },
    midnightProvider: {
      getCoinPublicKey: () => coinPublicKey,
      getEncryptionPublicKey: () => zswapSecretKeys.encryptionPublicKey,
      balanceTx: async (tx, ttl) => {
        const recipe = await wallet.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
          { ttl },
        );
        return wallet.finalizeRecipe(recipe);
      },
      submitTx: (tx) => wallet.submitTransaction(tx),
    },
  };

  const { Contract, ledger, pureCircuits } = await import(
    "../contracts/managed/tokenized-choreo-kits/contract/index.js"
  );
  const { CompiledContract } = await import(
    "@midnight-ntwrk/midnight-js-protocol/compact-js"
  );

  const deployerSecret = crypto.getRandomValues(new Uint8Array(32));
  const witnesses = {
    localSecretKey: (ctx) => {
      const sk = ctx?.privateState?.localSecretKey ?? deployerSecret;
      return [{ ...(ctx?.privateState ?? {}), localSecretKey: sk }, sk];
    },
  };

  const compiledContract = CompiledContract.make(
    "TokenizedChoreoKitsContract",
    Contract,
  ).pipe(
    (self) => CompiledContract.withWitnesses(self, witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  logger.info("Deploying TokenizedChoreoKits contract...");
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: "choreo-kits-deployer",
    initialPrivateState: { localSecretKey: deployerSecret },
  });


  const contractAddress = deployed.deployTxData.public.contractAddress;
  logger.info(`Contract deployed at: ${contractAddress}`);

  // Sanity-check the ledger state.
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) {
    throw new Error("Contract state not found on indexer after deployment.");
  }
  const parsed = ledger(state.data);
  logger.info({ kitCount: Number(parsed.kit_count) }, "Initial contract state");

  // Persist the address so `bun run dev` can pick it up.
  const envPath = path.resolve(new URL(import.meta.url).pathname, "..", "..", ".env");
  let env = "";
  try {
    env = await readFile(envPath, "utf8");
  } catch {
    // .env does not exist yet; we'll create it from the example.
    try {
      env = await readFile(envPath + ".example", "utf8");
    } catch {
      // no example either
    }
  }

  const updated = env.includes("VITE_DEFAULT_CONTRACT=")
    ? env.replace(
        /^VITE_DEFAULT_CONTRACT=.*$/m,
        `VITE_DEFAULT_CONTRACT=${contractAddress}`,
      )
    : env.trimEnd() + `\nVITE_DEFAULT_CONTRACT=${contractAddress}\n`;

  await writeFile(envPath, updated);
  logger.info(`Wrote VITE_DEFAULT_CONTRACT to ${envPath}`);

  console.log("\n=== DEPLOYMENT SUCCESS ===");
  console.log(`Contract address: ${contractAddress}`);
  console.log(`It has also been saved to .env as VITE_DEFAULT_CONTRACT.`);
  console.log("You can now open the app and connect Lace to ws://localhost:9944.");

  await wallet.stop();
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  console.error("\nDeployment failed:", err.message);
  process.exit(1);
});
