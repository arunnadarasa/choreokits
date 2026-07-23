import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { useCallback, useEffect, useState } from "react";
import { publishKit } from "@/lib/contract";
import type { DustInfo } from "@/lib/use-midnight-wallet";

const NETWORK_ID = (import.meta.env.VITE_NETWORK_ID as string) || "undeployed";
const IS_UNDEPLOYED = NETWORK_ID === "undeployed";

export function PublishKitForm({
  walletConnected,
  walletApi,
  contractAddress,
  dust,
  onPublished,
}: {
  walletConnected: boolean;
  walletApi: ConnectedAPI | null;
  contractAddress: string | null;
  dust?: DustInfo;
  onPublished: (payload: KitPayload) => void;
}) {
  const dustEmpty = !dust || dust.balance <= 0n;
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [priceDust, setPriceDust] = useState("10");
  const [proving, setProving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!proving) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(iv);
  }, [proving]);

  const submit = useCallback(async () => {
    setError(null);
    setOk(null);
    if (!contractAddress) {
      setError("Set the deployed contract address in step 2 first.");
      return;
    }
    if (!IS_UNDEPLOYED && !walletConnected) {
      setError("Connect Lace first.");
      return;
    }
    if (!IS_UNDEPLOYED && dustEmpty && walletApi) {
      setError("Lace has 0 tDUST — fees can't be paid. Fund via scripts/fund-lace.sh, then Generate tDUST in Lace.");
      return;
    }
    if (!title.trim() || !steps.trim()) {
      setError("Title and steps are required.");
      return;
    }
    const payload: KitPayload = {
      title: title.trim(),
      steps: steps.trim(),
      priceDust: Number(priceDust) || 0,
      publishedAt: new Date().toISOString(),
    };
    setProving(true);
    try {
      let txId: string | undefined;

      if (IS_UNDEPLOYED) {
        // Lace cannot sign on Undeployed. Route through the server API which
        // uses the same in-process Fluent wallet as the deploy script.
        const resp = await fetch("/api/mint", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contractAddress,
            title: payload.title,
            steps: payload.steps,
            priceDust: payload.priceDust,
          }),
        });
        const data = (await resp.json().catch(() => ({}))) as { txId?: string; error?: string };
        if (!resp.ok) throw new Error(data.error || `Mint failed (${resp.status})`);
        txId = data.txId;
        setOk(`Submitted on-chain (server-signed). Tx: ${txId ?? "submitted"}`);
      } else if (!walletApi) {
        await new Promise((r) => setTimeout(r, 2000));
        setOk("Kit staged locally. Connect Lace and set a deployed contract to broadcast on-chain.");
      } else {
        txId = await publishKit(
          walletApi,
          NETWORK_ID,
          contractAddress,
          payload.title,
          payload.steps,
          payload.priceDust,
        );
        setOk(`Submitted on-chain. Tx: ${txId}`);
      }

      // Persist only AFTER a confirmed mint, with the txId attached so the
      // Kit Feed shows the full hash and can dedupe against indexer rows.
      const stored: KitPayload = { ...payload, txId };
      const local = JSON.parse(localStorage.getItem("choreo:local-kits") ?? "[]") as KitPayload[];
      local.unshift(stored);
      localStorage.setItem("choreo:local-kits", JSON.stringify(local.slice(0, 20)));

      onPublished(stored);
      setTitle("");
      setSteps("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
      setElapsed(0);
    }
  }, [walletConnected, walletApi, contractAddress, dustEmpty, title, steps, priceDust, onPublished]);

  const disabled =
    proving ||
    !contractAddress ||
    (!IS_UNDEPLOYED && (!walletConnected || (dustEmpty && !!walletApi)));

  return (
    <div className="p-5 border border-border rounded-md space-y-3 bg-card">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        03 · publish choreo kit
      </div>

      {IS_UNDEPLOYED && (
        <p className="text-[11px] text-muted-foreground border border-dashed border-border rounded px-3 py-2">
          <strong>Undeployed mode:</strong> signing with the local genesis wallet on the server.
          Lace cannot balance transactions on <code className="font-mono">undeployed</code> — this
          bypasses Lace entirely. Switch to Preview/Preprod to use Lace.
        </p>
      )}

      <div className="grid gap-2">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Krump Foundations Vol. 1"
          className="px-3 py-2 bg-background border border-border rounded text-sm"
        />

        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Steps summary
        </label>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={4}
          placeholder="8-count breakdown, chest pops, arm swings, jab sequence…"
          className="px-3 py-2 bg-background border border-border rounded text-sm font-mono"
        />

        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          License price (tDUST)
        </label>
        <input
          type="number"
          min={0}
          value={priceDust}
          onChange={(e) => setPriceDust(e.target.value)}
          className="w-32 px-3 py-2 bg-background border border-border rounded text-sm font-mono"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void submit()}
          disabled={disabled}
          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider rounded disabled:opacity-40"
        >
          {proving ? `Proving… ${elapsed}s` : "Mint kit (ZK)"}
        </button>
        {proving && (
          <span className="text-[11px] text-muted-foreground">
            Generating ZK proof. Up to ~4 min on first mint (cold proof server), 30–60s after.
          </span>
        )}
      </div>

      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {ok && <p className="text-[12px] text-primary">{ok}</p>}
    </div>
  );
}

export type KitPayload = {
  title: string;
  steps: string;
  priceDust: number;
  publishedAt: string;
  txId?: string;
};

