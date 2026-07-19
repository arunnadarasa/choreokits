import { useCallback, useEffect, useState } from "react";

export type WalletStatus =
  | "idle"
  | "detecting"
  | "ready"
  | "connecting"
  | "connected"
  | "error";

type Connector = {
  apiVersion: string;
  name?: string;
  connect: (networkId: string) => Promise<ConnectedApi>;
};

type ConnectedApi = {
  getShieldedAddresses?: () => Promise<string[] | Record<string, string>>;
  getUnshieldedAddress?: () => Promise<string>;
};

function pickConnector(): Connector | null {
  if (typeof window === "undefined") return null;
  const m = (window as unknown as { midnight?: Record<string, Connector> }).midnight;
  if (!m) return null;
  for (const v of Object.values(m)) {
    if (v && typeof v === "object" && "apiVersion" in v && /^4\./.test(String(v.apiVersion))) {
      return v as Connector;
    }
  }
  const first = Object.values(m)[0];
  return first && "apiVersion" in first ? (first as Connector) : null;
}

function inferNetwork(addr: string): string {
  const m = addr.match(/^mn_(?:shield-)?addr_([a-z0-9]+?)1/i);
  if (!m) return "unknown";
  const s = m[1].toLowerCase();
  if (s === "test") return "preprod";
  if (s === "undeployed") return "undeployed";
  return s;
}

export function useMidnightWallet() {
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [address, setAddress] = useState<string | null>(null);
  const [apiVersion, setApiVersion] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStatus((p) => (p === "connected" ? p : "detecting"));
    setError(null);
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      const c = pickConnector();
      if (c) {
        window.clearInterval(iv);
        setApiVersion(c.apiVersion);
        setStatus((p) => (p === "connected" ? p : "ready"));
        if (!/^4\./.test(c.apiVersion)) {
          setStatus("error");
          setError(`Lace connector ${c.apiVersion} is not compatible. Update Lace.`);
        }
      } else if (Date.now() - t0 > 5000) {
        window.clearInterval(iv);
        setStatus("error");
        setError("No Midnight wallet detected. Install Lace from lace.io.");
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [tick]);

  const connect = useCallback(async () => {
    try {
      setError(null);
      setStatus("connecting");
      const c = pickConnector();
      if (!c) throw new Error("No Midnight wallet detected.");
      const preferred = (import.meta.env.VITE_NETWORK_ID as string) || "undeployed";
      const candidates = Array.from(new Set([preferred, "undeployed", "preview", "preprod"]));
      let api: ConnectedApi | null = null;
      let used: string | null = null;
      let mismatch: unknown = null;
      for (const n of candidates) {
        try {
          api = await c.connect(n);
          used = n;
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/network|mismatch/i.test(msg)) {
            mismatch = e;
            continue;
          }
          throw e;
        }
      }
      if (!api || !used) {
        throw new Error(
          mismatch
            ? "Lace is on a different network. Switch Lace to your local Undeployed node and retry."
            : "Failed to connect to Lace.",
        );
      }
      let addr: string | null = null;
      if (typeof api.getShieldedAddresses === "function") {
        try {
          const s = await api.getShieldedAddresses();
          if (Array.isArray(s)) addr = s[0] ?? null;
          else if (s && typeof s === "object") addr = Object.values(s)[0] ?? null;
        } catch {
          // ignore
        }
      }
      if (!addr && typeof api.getUnshieldedAddress === "function") {
        try {
          addr = await api.getUnshieldedAddress();
        } catch {
          // ignore
        }
      }
      if (!addr) throw new Error("Connected but couldn't read an address. Update Lace.");
      setAddress(addr);
      setNetwork(used ?? inferNetwork(addr));
      setApiVersion(c.apiVersion);
      setStatus("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  return {
    status,
    address,
    apiVersion,
    network,
    error,
    connect,
    disconnect: () => {
      setAddress(null);
      setNetwork(null);
      setStatus("ready");
      setError(null);
    },
    redetect: () => setTick((n) => n + 1),
  };
}
