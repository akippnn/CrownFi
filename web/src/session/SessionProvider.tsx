"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  connectFreighter,
  CrownFiStellarNetwork,
  signWalletMessage,
} from "@/wallet/freighter";

export type Fan = {
  id: string;
  handle: string;
  walletAddress: string;
  points: number;
};

export type LinkedWallet = {
  id: string;
  network: CrownFiStellarNetwork;
  address: string;
  is_primary: boolean;
  verified_at?: string | null;
  created_at: string;
};

export type OrganizationRole = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: "owner" | "admin" | "editor" | "viewer" | string;
};

export type CrownFiAccount = {
  id: string;
  display_name: string;
  email?: string | null;
  status: string;
  site_role?: "owner" | "admin" | null;
  wallets: LinkedWallet[];
  organization_roles: OrganizationRole[];
  created_at: string;
  updated_at: string;
};

type SetupStatus = {
  setup_required: boolean;
  site_name: string;
  stellar_network: CrownFiStellarNetwork;
  mainnet_available: boolean;
  default_pageant_id?: string | null;
  pageant_selector_enabled: boolean;
};

type Ctx = {
  fan: Fan | null;
  account: CrownFiAccount | null;
  address: string | null;
  isAdmin: boolean;
  isOrganizer: boolean;
  adminAllowlistConfigured: boolean;
  setupRequired: boolean;
  siteName: string;
  stellarNetwork: CrownFiStellarNetwork;
  mainnetAvailable: boolean;
  hostedPageantId: string | null;
  pageantSelectorEnabled: boolean;
  ready: boolean;
  connecting: boolean;
  error: string;
  needsInstall: boolean;
  connect: () => Promise<void>;
  linkWallet: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
};

const C = createContext<Ctx | null>(null);

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<CrownFiAccount | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus>({
    setup_required: false,
    site_name: "CrownFi",
    stellar_network: "testnet",
    mainnet_available: false,
    default_pageant_id: null,
    pageant_selector_enabled: false,
  });
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);

  async function loadSetupStatus(): Promise<SetupStatus> {
    try {
      const response = await fetch("/api/setup/status", { cache: "no-store" });
      const data = await readJson(response);
      if (response.ok && typeof data.setup_required === "boolean") {
        const next: SetupStatus = {
          setup_required: data.setup_required,
          site_name: String(data.site_name || "CrownFi"),
          stellar_network: data.stellar_network === "public" ? "public" : "testnet",
          mainnet_available: Boolean(data.mainnet_available),
          default_pageant_id: data.default_pageant_id ?? null,
          pageant_selector_enabled: Boolean(data.pageant_selector_enabled),
        };
        setSetupStatus(next);
        return next;
      }
    } catch {
      // The main shell remains usable and reports the connection error when an action is attempted.
    }
    return setupStatus;
  }

  async function loadAccount() {
    try {
      const response = await fetch("/api/account/session", { cache: "no-store" });
      const data = await readJson(response);
      if (response.ok && data.account) {
        setAccount(data.account as CrownFiAccount);
        setAddress(String(data.currentWallet || "") || null);
        return;
      }
    } catch {
      // A missing session is an ordinary signed-out state.
    }
    setAccount(null);
    setAddress(null);
  }

  async function refresh() {
    await Promise.all([loadSetupStatus(), loadAccount()]);
  }

  useEffect(() => {
    refresh().finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function authenticate(purpose: "login" | "link" | "setup") {
    setConnecting(true);
    setError("");
    setNeedsInstall(false);
    try {
      const status = await loadSetupStatus();
      const wallet = await connectFreighter(status.stellar_network);
      if (wallet.notInstalled) {
        setNeedsInstall(true);
        setError(wallet.error || "Freighter was not detected.");
        return;
      }
      if (wallet.error || !wallet.address) {
        setError(wallet.error || "Freighter did not return an account.");
        return;
      }

      const challengeResponse = await fetch("/api/account/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: wallet.address,
          network: status.stellar_network,
          purpose,
        }),
      });
      const challenge = await readJson(challengeResponse);
      if (!challengeResponse.ok) {
        setError(challenge.error || "CrownFi could not create a wallet challenge.");
        return;
      }

      const signed = await signWalletMessage(challenge.message, wallet.address);
      if (signed.error || !signed.signature) {
        setError(signed.error || "Wallet authorization was cancelled.");
        return;
      }

      const verificationResponse = await fetch("/api/account/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challenge_id,
          address: wallet.address,
          network: status.stellar_network,
          message: challenge.message,
          signature: signed.signature,
          purpose,
        }),
      });
      const verified = await readJson(verificationResponse);
      if (!verificationResponse.ok) {
        setError(verified.error || "CrownFi could not verify wallet ownership.");
        return;
      }
      setAccount(verified.profile as CrownFiAccount);
      setAddress(String(verified.current_wallet || wallet.address));
    } catch {
      setError("CrownFi could not reach the account service. Check the local stack and retry.");
    } finally {
      setConnecting(false);
    }
  }

  async function connect() {
    await authenticate(setupStatus.setup_required ? "setup" : "login");
  }

  async function linkWallet() {
    if (!account) {
      setError("Sign in to your CrownFi account before linking another wallet.");
      return;
    }
    await authenticate("link");
  }

  async function disconnect() {
    try {
      await fetch("/api/account/session", { method: "DELETE" });
    } finally {
      setAccount(null);
      setAddress(null);
      setError("");
      setNeedsInstall(false);
    }
  }

  function clearError() {
    setError("");
    setNeedsInstall(false);
  }

  const isAdmin = account?.site_role === "owner" || account?.site_role === "admin";
  const isOrganizer =
    isAdmin ||
    Boolean(
      account?.organization_roles?.some((membership) =>
        ["owner", "admin", "editor"].includes(membership.role),
      ),
    );
  const fan = useMemo<Fan | null>(() => {
    if (!account || !address) return null;
    return {
      id: account.id,
      handle: account.display_name,
      walletAddress: address,
      points: 0,
    };
  }, [account, address]);

  return (
    <C.Provider
      value={{
        fan,
        account,
        address,
        isAdmin,
        isOrganizer,
        adminAllowlistConfigured: !setupStatus.setup_required,
        setupRequired: setupStatus.setup_required,
        siteName: setupStatus.site_name,
        stellarNetwork: setupStatus.stellar_network,
        mainnetAvailable: setupStatus.mainnet_available,
        hostedPageantId: setupStatus.default_pageant_id ?? null,
        pageantSelectorEnabled: setupStatus.pageant_selector_enabled,
        ready,
        connecting,
        error,
        needsInstall,
        connect,
        linkWallet,
        disconnect,
        refresh,
        clearError,
      }}
    >
      {children}
    </C.Provider>
  );
}

export function useSession() {
  const context = useContext(C);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
