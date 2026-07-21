import { useEffect, useState } from "react";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { useMidnightWallet } from "@/lib/use-midnight-wallet";

function truncate(a: string, h = 14, t = 10) {
  return a.length <= h + t + 1 ? a : `${a.slice(0, h)}…${a.slice(-t)}`;
}

export function WalletConnectPanel({
  expectedNetwork = "undeployed",
  onConnected,
  onApiReady,
}: {
  expectedNetwork?: string;
  onConnected?: (addr: string) => void;
  onApiReady?: (api: ConnectedAPI) => void;
}) {
  const w = useMidnightWallet();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (w.status === "connected" && w.address) onConnected?.(w.address);
    if (w.status === "connected" && w.api) onApiReady?.(w.api);
  }, [w.status, w.address, w.api, onConnected, onApiReady]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const wrong =
    w.status === "connected" &&
    w.network &&
    w.network !== "unknown" &&
    w.network !== expectedNetwork;

  return (
    <div className="p-5 border border-border rounded-md space-y-3 bg-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          01 · connect lace
        </span>
        {w.apiVersion && (
          <span className="text-[10px] font-mono opacity-60">connector v{w.apiVersion}</span>
        )}
      </div>

      {w.status === "detecting" && (
        <p className="text-sm text-muted-foreground">Detecting Midnight wallet…</p>
      )}

      {w.status === "ready" && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void w.connect()}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider rounded"
          >
            Connect wallet
          </button>
          <span className="text-xs text-muted-foreground">
            Reads your shielded address — no signing, no funds moved.
          </span>
        </div>
      )}

      {w.status === "connecting" && (
        <p className="text-sm text-muted-foreground">Approve the connection in Lace…</p>
      )}

      {w.status === "connected" && w.address && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            shielded address
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-xs break-all">{truncate(w.address)}</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(w.address ?? "");
                setCopied(true);
              }}
              className="text-[10px] uppercase tracking-widest text-primary"
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <div className="flex items-center gap-4 text-[11px] flex-wrap">
            <span>
              network · <span className="font-mono">{w.network}</span>
            </span>
            <button
              onClick={w.disconnect}
              className="text-[10px] uppercase tracking-widest opacity-60"
            >
              disconnect
            </button>
          </div>
          {wrong && (
            <p className="text-[12px] text-destructive">
              Lace is on <span className="font-mono">{w.network}</span> but this app expects{" "}
              <span className="font-mono">{expectedNetwork}</span>. Switch networks inside Lace
              (Settings → Network → Custom → ws://localhost:9944).
            </p>
          )}
        </div>
      )}

      {w.status === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{w.error ?? "Something went wrong."}</p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={w.redetect}
              className="px-3 py-2 border border-border text-[10px] uppercase tracking-widest rounded"
            >
              Retry
            </button>
            <a
              href="https://www.lace.io/"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 border border-border text-[10px] uppercase tracking-widest rounded"
            >
              Install Lace ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
