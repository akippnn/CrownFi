"use client";
// Client-side Freighter integration, pinned to Testnet for now.
// Freighter is a non-custodial Stellar browser extension: the user connects with one popup,
// and CrownFi never sees or stores their private key. The connected G... address is saved to
// the fan record and used as the destination for tickets and collectibles.

import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  getNetworkDetails,
  signTransaction,
  signMessage,
} from "@stellar/freighter-api";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

// Freighter's v5 errors are objects ({ message, code }); stringify them readably.
function errMsg(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null && "message" in e) return String((e as any).message);
  return String(e);
}

// Prompts the user to connect. Opens the Freighter popup in one call, enforces Testnet.
// `notInstalled` lets the UI send the user to freighter.app instead of showing a dead button.
export async function connectFreighter(): Promise<{ address?: string; error?: string; notInstalled?: boolean }> {
  if (typeof window === "undefined") return { error: "not in browser" };

  // Is the extension present? (returns false if Freighter isn't installed/injected yet)
  let installed = false;
  try {
    const conn = await isConnected();
    installed = !!conn.isConnected;
  } catch {
    installed = false;
  }
  if (!installed) {
    return {
      notInstalled: true,
      error: "Freighter not detected. Install it from freighter.app, then reload this page and try again.",
    };
  }

  // This is the call that pops open the Freighter window for the user to approve.
  const access = await requestAccess();
  if (access.error) return { error: errMsg(access.error) || "Connection was rejected in Freighter." };
  if (!access.address) return { error: "No account returned. Open Freighter, unlock it, then try again." };

  // Enforce Testnet, but don't hard-fail if the network can't be read.
  try {
    const net = await getNetworkDetails();
    if (!net.error && net.networkPassphrase && net.networkPassphrase !== TESTNET_PASSPHRASE) {
      return { error: "Freighter is on the wrong network. Switch it to Testnet, then reconnect." };
    }
  } catch {
    /* network read failed — proceed with the address we have */
  }

  return { address: access.address };
}

// Returns the current address if the user already granted access (no prompt), else null.
export async function getConnectedAddress(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const allowed = await isAllowed();
    if (!allowed.isAllowed) return null;
    const res = await getAddress();
    return res.error ? null : res.address;
  } catch {
    return null;
  }
}

// Sign a transaction XDR with Freighter (Testnet). Used once contracts are deployed and the
// backend hands the user an unsigned XDR to approve (buying a collectible, etc.).
export async function signWithFreighter(
  xdr: string,
  address: string
): Promise<{ signedXdr?: string; error?: string }> {
  const res = await signTransaction(xdr, { networkPassphrase: TESTNET_PASSPHRASE, address });
  if (res.error) return { error: String(res.error) };
  return { signedXdr: res.signedTxXdr };
}


// Sign a short admin-auth challenge. The backend verifies the SEP-53 signature and returns
// an httpOnly admin session cookie; private keys never leave Freighter.
export async function signAdminMessage(
  message: string,
  address: string
): Promise<{ signature?: string; error?: string }> {
  const res = await signMessage(message, { address });
  if (res.error) return { error: errMsg(res.error) || "Message signing was rejected." };
  if (!res.signedMessage) return { error: "No signature returned by Freighter." };
  const signature = typeof res.signedMessage === "string"
    ? res.signedMessage
    : Buffer.from(res.signedMessage).toString("base64");
  return { signature };
}
