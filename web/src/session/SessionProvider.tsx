"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { connectFreighter, getConnectedAddress } from "@/wallet/freighter";

export type Fan = { id: string; handle: string; walletAddress: string; points: number };

type Ctx = {
  fan: Fan | null;
  address: string | null;
  isAdmin: boolean;
  adminAllowlistConfigured: boolean;
  ready: boolean;
  connecting: boolean;
  error: string;
  needsInstall: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  clearError: () => void;
};

const C = createContext<Ctx | null>(null);
// Admin is decided by an allowlist of Stellar addresses. Set NEXT_PUBLIC_ADMIN_WALLETS in .env.
// Note: enforce this server-side too (see Codex's adminAuth pattern) before mainnet.
const ADMIN = (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [fan, setFan] = useState<Fan | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);

  // Returns true on success. On failure sets a specific, human-readable error.
  async function linkFan(addr: string): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch("/api/fans/connect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: addr }),
      });
    } catch {
      setError("Could not reach the server. Is the dev server running?");
      return false;
    }
    if (res.ok) {
      setFan(await res.json());
      setAddress(addr);
      localStorage.setItem("crownfi.addr", addr);
      return true;
    }
    // The wallet connected fine; the DB write is what failed.
    if (res.status === 503) {
      setError("Wallet connected — but the database isn't set up yet. Follow SUPABASE.md, then reconnect.");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(`Could not link wallet${body?.error ? `: ${body.error}` : "."}`);
    }
    return false;
  }

  useEffect(() => {
    (async () => {
      const saved = typeof window !== "undefined" ? localStorage.getItem("crownfi.addr") : null;
      if (saved) {
        const cur = await getConnectedAddress();
        if (cur && cur === saved) await linkFan(saved);
        else localStorage.removeItem("crownfi.addr");
      }
      setReady(true);
    })();
  }, []);

  async function connect() {
    setConnecting(true); setError(""); setNeedsInstall(false);
    try {
      const res = await connectFreighter();
      if (res.notInstalled) {
        // Never substitute a fabricated G-address for an actual Testnet wallet.
        // A real transaction must be signed by Freighter and sourced from a
        // funded Stellar account. Mock wallet flows remain available through
        // their server-side test fixtures, not this Connect button.
        setError("Freighter was not detected. Install the browser extension, or open CrownFi from Freighter mobile's Discover browser.");
        setNeedsInstall(true);
        return;
      }
      if (res.error || !res.address) { setError(res.error ?? "Could not connect"); return; }
      await linkFan(res.address);
    } finally {
      setConnecting(false);
    }
  }
  function disconnect() { setFan(null); setAddress(null); setError(""); localStorage.removeItem("crownfi.addr"); }
  async function refresh() { if (address) await linkFan(address); }
  function clearError() { setError(""); setNeedsInstall(false); }

  const isAdmin = !!address && ADMIN.includes(address);
  const adminAllowlistConfigured = ADMIN.length > 0;

  return (
    <C.Provider value={{ fan, address, isAdmin, adminAllowlistConfigured, ready, connecting, error, needsInstall, connect, disconnect, refresh, clearError }}>
      {children}
    </C.Provider>
  );
}

export function useSession() {
  const c = useContext(C);
  if (!c) throw new Error("useSession must be used within SessionProvider");
  return c;
}
