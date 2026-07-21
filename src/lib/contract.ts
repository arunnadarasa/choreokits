import { Buffer } from "buffer";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { createCircuitCallTxInterface } from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type {
  CoinPublicKey,
  EncPublicKey,
  FinalizedTransaction,
  Transaction,
  TransactionId,
  UnprovenTransaction,
} from "@midnight-ntwrk/midnight-js-protocol/ledger";
import type {
  MidnightProvider,
  PrivateStateProvider,
  ProofProvider,
  PublicDataProvider,
  WalletProvider,
  ZKConfigProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { createProofProvider } from "@midnight-ntwrk/midnight-js-types";
import { parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from "@midnight-ntwrk/midnight-js-utils";

const LOCAL_PASSWORD = "Choreo-Kits-Local-2026!";
const PRIVATE_STATE_ID = "choreo-kits-author";

export type KitPayload = {
  title: string;
  steps: string;
  priceDust: number;
  publishedAt: string;
};

type ContractModule = {
  Contract: unknown;
  ledger: (state: string) => {
    kit_count: bigint;
    last_kit: string;
    last_author_commitment: string;
  };
};

let contractModuleCache: ContractModule | null = null;

export async function loadContractModule(): Promise<ContractModule | null> {
  if (contractModuleCache) return contractModuleCache;
  const candidates = ["/contract/index.js"];
  for (const src of candidates) {
    try {
      const mod = (await import(/* @vite-ignore */ src)) as ContractModule;
      contractModuleCache = mod;
      return mod;
    } catch {
      // try next
    }
  }
  return null;
}

class FetchZKConfigProvider implements ZKConfigProvider<string> {
  constructor(private base: string) {}

  private async fetchBytes(path: string): Promise<Uint8Array> {
    const r = await fetch(`${this.base}${path}`);
    if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  async getZKIR(circuitId: string): Promise<any> {
    return this.fetchBytes(`/zkir/${circuitId}.bzkir`);
  }

  async getProverKey(circuitId: string): Promise<any> {
    return this.fetchBytes(`/keys/${circuitId}.prover`);
  }

  async getVerifierKey(circuitId: string): Promise<any> {
    return this.fetchBytes(`/keys/${circuitId}.verifier`);
  }

  async getVerifierKeys(circuitIds: string[]): Promise<any> {
    return Promise.all(
      circuitIds.map(async (id) => [id, await this.getVerifierKey(id)] as [string, any]),
    );
  }

  async get(circuitId: string): Promise<any> {
    return {
      circuitId,
      zkir: await this.getZKIR(circuitId),
      proverKey: await this.getProverKey(circuitId),
      verifierKey: await this.getVerifierKey(circuitId),
    };
  }

  asKeyMaterialProvider(): any {
    return this;
  }
}

async function getWalletKeys(api: ConnectedAPI, networkId: string) {
  const addrs = await api.getShieldedAddresses();
  return {
    coinPublicKey: parseCoinPublicKeyToHex(addrs.shieldedCoinPublicKey, networkId),
    encryptionPublicKey: parseEncPublicKeyToHex(addrs.shieldedEncryptionPublicKey, networkId),
  };
}

class LaceWalletProvider implements WalletProvider {
  constructor(
    private api: ConnectedAPI,
    private coinPublicKey: CoinPublicKey,
    private encryptionPublicKey: EncPublicKey,
  ) {}

  getCoinPublicKey(): CoinPublicKey {
    return this.coinPublicKey;
  }

  getEncryptionPublicKey(): EncPublicKey {
    return this.encryptionPublicKey;
  }

  async balanceTx(tx: any, _ttl?: Date): Promise<FinalizedTransaction> {
    const hex = Buffer.from(tx.serialize()).toString("hex");
    const { tx: balancedHex } = await this.api.balanceUnsealedTransaction(hex, { payFees: true });
    const bytes = Buffer.from(balancedHex, "hex");
    const { Transaction } = await import("@midnight-ntwrk/midnight-js-protocol/ledger");
    return Transaction.deserialize("signature" as never, "proof" as never, "binding" as never, bytes) as FinalizedTransaction;
  }
}

class LaceMidnightProvider implements MidnightProvider {
  constructor(private api: ConnectedAPI) {}

  async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
    const hex = Buffer.from(tx.serialize()).toString("hex");
    await this.api.submitTransaction(hex);
    return tx.transactionHash();
  }
}

async function createPrivateStateProvider(accountId: string): Promise<PrivateStateProvider> {
  const { BrowserLevel } = await import("browser-level");
  return levelPrivateStateProvider({
    privateStateStoreName: "choreo-kits-local",
    privateStoragePasswordProvider: () => LOCAL_PASSWORD,
    accountId,
    levelFactory: (dbName: string) => new BrowserLevel(dbName) as unknown as any,
  });
}

async function ensurePrivateState(
  provider: PrivateStateProvider,
  contractAddress: string,
  privateStateId: string,
) {
  provider.setContractAddress(contractAddress);
  const existing = await provider.get(privateStateId);
  if (!existing) {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    await provider.set(privateStateId, { localSecretKey: secret });
  }
}

export async function publishKit(
  api: ConnectedAPI,
  networkId: string,
  contractAddress: string,
  title: string,
  steps: string,
  priceDust: number,
): Promise<string> {
  setNetworkId(networkId);

  const cfg = await api.getConfiguration();
  const zkConfigProvider: ZKConfigProvider<string> = new FetchZKConfigProvider(window.location.origin);
  const provingProvider = await api.getProvingProvider(zkConfigProvider);
  const proofProvider: ProofProvider = createProofProvider(provingProvider);
  const publicDataProvider: PublicDataProvider = indexerPublicDataProvider(cfg.indexerUri, cfg.indexerWsUri);

  const { coinPublicKey, encryptionPublicKey } = await getWalletKeys(api, networkId);
  const privateStateProvider = await createPrivateStateProvider(coinPublicKey);
  const walletProvider: WalletProvider = new LaceWalletProvider(api, coinPublicKey, encryptionPublicKey);
  const midnightProvider: MidnightProvider = new LaceMidnightProvider(api);

  await ensurePrivateState(privateStateProvider, contractAddress, PRIVATE_STATE_ID);

  const contractMod = await loadContractModule();
  if (!contractMod) {
    throw new Error(
      'Compiled contract not found in public/contract. Run "bun run midnight:compile" first.',
    );
  }

  const { Contract } = contractMod;
  const { CompiledContract } = await import("@midnight-ntwrk/midnight-js-protocol/compact-js");

  const witnesses = {
    localSecretKey: (ctx: { privateState?: { localSecretKey?: Uint8Array } }) => {
      const sk = ctx?.privateState?.localSecretKey;
      if (!sk) throw new Error("Missing localSecretKey in private state");
      return [ctx.privateState, sk];
    },
  };

  const compiledContract = CompiledContract.withWitnesses(
    CompiledContract.make("TokenizedChoreoKitsContract", Contract),
    witnesses,
  );

  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };

  const circuitCall = createCircuitCallTxInterface(
    providers,
    compiledContract,
    contractAddress,
    PRIVATE_STATE_ID,
  );

  const payload = JSON.stringify({
    title: title.trim(),
    steps: steps.trim(),
    priceDust,
    publishedAt: new Date().toISOString(),
  });

  const result = await circuitCall.publishKit(payload);
  return result.public.txId;
}

export async function decodeChainState(hexState: string): Promise<{
  kitCount: number;
  lastKit: KitPayload | null;
  lastAuthorCommitment: string;
}> {
  const mod = await loadContractModule();
  if (!mod) {
    return { kitCount: 0, lastKit: null, lastAuthorCommitment: "" };
  }
  try {
    const state = mod.ledger(hexState);
    let lastKit: KitPayload | null = null;
    if (state.last_kit) {
      try {
        lastKit = JSON.parse(state.last_kit) as KitPayload;
      } catch {
        // ignore parse errors
      }
    }
    return {
      kitCount: Number(state.kit_count ?? 0),
      lastKit,
      lastAuthorCommitment: state.last_author_commitment ?? "",
    };
  } catch {
    return { kitCount: 0, lastKit: null, lastAuthorCommitment: "" };
  }
}
