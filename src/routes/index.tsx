import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@/components/ClientOnly";
import { WalletConnectPanel } from "@/components/WalletConnectPanel";
import { DeployPanel, CONTRACT_STORAGE_KEY } from "@/components/DeployPanel";
import { PublishKitForm } from "@/components/PublishKitForm";
import { KitFeed } from "@/components/KitFeed";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tokenized Choreo Kits — ZK licensing for choreography" },
      {
        name: "description",
        content:
          "Sell bundled choreography sequences as tokenized, licensable assets on Midnight. Author identity stays private, provenance stays verifiable.",
      },
      {
        property: "og:title",
        content: "Tokenized Choreo Kits — ZK licensing for choreography",
      },
      {
        property: "og:description",
        content:
          "A Midnight ZK single-page demo: mint choreography kits with private authorship and public provenance.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <Header />
        <ClientOnly
          fallback={
            <div className="p-5 border border-border rounded-md text-sm text-muted-foreground">
              Loading Midnight client…
            </div>
          }
        >
          <Demo />
        </ClientOnly>
        <Footer />
      </div>
    </div>
  );
}

function Header() {
  const expected = (import.meta.env.VITE_NETWORK_ID as string) || "undeployed";
  return (
    <header className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Midnight · Compact 0.23 · {expected}
      </div>
      <h1 className="text-3xl font-bold tracking-tight">Tokenized Choreo Kits</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Sell bundled choreography sequences as tokenized, licensable assets. Each kit lands on
        the Midnight ledger with a ZK author commitment — the world sees the kit and its price,
        but the author's identity stays private until they choose to reveal it.
      </p>
      <div className="text-[11px] text-muted-foreground border border-dashed border-border rounded px-3 py-2">
        <strong>Hackathon target:</strong> DeFi Track (tokenized/licensable content on Midnight).
        Also relevant to Gaming & Beginner Hack tracks.
      </div>
    </header>
  );
}

function Demo() {
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [contractAddr, setContractAddr] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const envDefault = import.meta.env.VITE_DEFAULT_CONTRACT as string | undefined;
    const saved = localStorage.getItem(CONTRACT_STORAGE_KEY) || envDefault || null;
    if (saved) setContractAddr(saved);
  }, []);

  return (
    <div className="space-y-5">
      <WalletConnectPanel
        expectedNetwork={(import.meta.env.VITE_NETWORK_ID as string) || "undeployed"}
        onConnected={setWalletAddr}
      />
      <DeployPanel
        walletConnected={!!walletAddr}
        address={contractAddr}
        onDeployed={(a) => {
          setContractAddr(a);
          setRefreshTick((t) => t + 1);
        }}
      />
      <PublishKitForm
        walletConnected={!!walletAddr}
        contractAddress={contractAddr}
        onPublished={() => setRefreshTick((t) => t + 1)}
      />
      <KitFeed contractAddress={contractAddr} refreshTick={refreshTick} />
    </div>
  );
}

function Footer() {
  return (
    <footer className="pt-6 border-t border-border space-y-2 text-[11px] text-muted-foreground">
      <p>
        Built during the <strong>Creative AI &amp; Quantum Hackathon</strong> organised by
        StreetKode Fam during Indian Krump Festival 14.
      </p>
      <p>
        Runs against a local Midnight standalone stack (node · indexer · proof server).
        See <code className="font-mono">README.md</code> for the one-command bring-up.
      </p>
    </footer>
  );
}
