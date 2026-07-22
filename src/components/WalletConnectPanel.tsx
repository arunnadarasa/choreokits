import { useEffect, useState } from "react";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { useMidnightWallet, type DustInfo } from "@/lib/use-midnight-wallet";

function truncate(a: string, h = 14, t = 10) {
  return a.length <= h + t + 1 ? a : `${a.slice(0, h)}…${a.slice(-t)}`;
}

function fmtDust(n: bigint): string {
  // dust is a very large integer; render as decimal with up to 4 significant digits.
  if (n === 0n) return "0";
  const s = n.toString();
  if (s.length <= 6) return s;
  return `${s.slice(0, s.length - 6)}.${s.slice(s.length - 6, s.length - 4)}M`;
}

export function WalletConnectPanel({
  expectedNetwork = "undeployed",
  onConnected,
  onApiReady,
  onDustChange,
}: {
  expectedNetwork?: string;
  onConnected?: (addr: string) => void;
  onApiReady?: (api: ConnectedAPI) => void;
  onDustChange?: (dust: DustInfo) => void;
}) {
  const w = useMidnightWallet();
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (w.status === "connected" && w.address) onConnected?.(w.address);
    if (w.status === "connected" && w.api) onApiReady?.(w.api);
  }, [w.status, w.address, w.api, onConnected, onApiReady]);

  useEffect(() => {
    onDustChange?.(w.dust);
  }, [w.dust, onDustChange]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const wrong =
    w.status === "connected" &&
    w.network &&
    w.network !== "unknown" &&
    w.network !== expectedNetwork;

  const dustEmpty = w.status === "connected" && (!w.dust || w.dust.balance <= 0n);

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
            Reads your shielded &amp; unshielded addresses — no signing, no funds moved.
          </span>
        </div>
      )}

      {w.status === "connecting" && (
        <p className="text-sm text-muted-foreground">Approve the connection in Lace…</p>
      )}

      {w.status === "connected" && w.address && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              shielded address
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-mono text-xs break-all">{truncate(w.address)}</code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(w.address ?? "");
                  setCopied("shielded");
                }}
                className="text-[10px] uppercase tracking-widest text-primary"
              >
                {copied === "shielded" ? "copied" : "copy"}
              </button>
            </div>
          </div>

          {w.unshieldedAddress && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                unshielded address (paste into faucet)
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-xs break-all">
                  {truncate(w.unshieldedAddress)}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(w.unshieldedAddress ?? "");
                    setCopied("unshielded");
                  }}
                  className="text-[10px] uppercase tracking-widest text-primary"
                >
                  {copied === "unshielded" ? "copied" : "copy"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border ${
                dustEmpty
                  ? "border-destructive text-destructive"
                  : "border-primary text-primary"
              }`}
            >
              {w.dust
                ? dustEmpty
                  ? "tDUST tank empty"
                  : `tDUST ${fmtDust(w.dust.balance)} / ${fmtDust(w.dust.cap)}`
                : "tDUST unknown"}
            </span>
            <button
              onClick={() => void w.refreshDust()}
              className="text-[10px] uppercase tracking-widest opacity-60"
            >
              refresh
            </button>
          </div>

          {dustEmpty && (
            <div className="text-[11px] leading-relaxed p-3 border border-dashed border-destructive/60 rounded bg-destructive/5 space-y-2">
              <div className="font-semibold uppercase tracking-widest text-destructive">
                Fund this wallet before minting
              </div>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  In a second terminal, run{" "}
                  <code className="font-mono">scripts/fund-lace.sh</code> (clones and starts{" "}
                  <code className="font-mono">midnightntwrk/midnight-local-dev</code>).
                </li>
                <li>
                  Choose menu <strong>option 2</strong> — "Fund accounts by public key" — and paste
                  the unshielded address above. You get 50,000 tNIGHT.
                </li>
                <li>
                  Back in Lace, tap <strong>Generate tDUST</strong> on the tNIGHT balance.
                  This chip flips to a live number within one block.
                </li>
              </ol>
            </div>
          )}

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
