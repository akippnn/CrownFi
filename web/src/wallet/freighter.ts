"use client";

import {
  getAddress,
  getNetworkDetails,
  isAllowed,
  isConnected,
  requestAccess,
  signMessage,
  signTransaction,
} from "@stellar/freighter-api";

export type CrownFiStellarNetwork = "testnet" | "public";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

function errMsg(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

export function networkPassphrase(network: CrownFiStellarNetwork): string {
  return network === "public" ? PUBLIC_PASSPHRASE : TESTNET_PASSPHRASE;
}

export async function connectFreighter(
  expectedNetwork: CrownFiStellarNetwork = "testnet",
): Promise<{ address?: string; error?: string; notInstalled?: boolean }> {
  if (typeof window === "undefined") return { error: "not in browser" };

  let installed = false;
  try {
    const connection = await isConnected();
    installed = !!connection.isConnected;
  } catch {
    installed = false;
  }
  if (!installed) {
    return {
      notInstalled: true,
      error: "Freighter was not detected. Install it, reload CrownFi, and try again.",
    };
  }

  const access = await requestAccess();
  if (access.error) {
    return { error: errMsg(access.error) || "Connection was rejected in Freighter." };
  }
  if (!access.address) {
    return { error: "No account was returned. Unlock Freighter and try again." };
  }

  try {
    const network = await getNetworkDetails();
    const expectedPassphrase = networkPassphrase(expectedNetwork);
    if (
      !network.error &&
      network.networkPassphrase &&
      network.networkPassphrase !== expectedPassphrase
    ) {
      const label = expectedNetwork === "public" ? "Mainnet" : "Testnet";
      return { error: `Freighter is on the wrong network. Switch it to ${label}, then reconnect.` };
    }
  } catch {
    return { error: "CrownFi could not confirm the Freighter network. Unlock the extension and retry." };
  }

  return { address: access.address };
}

export async function getConnectedAddress(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const allowed = await isAllowed();
    if (!allowed.isAllowed) return null;
    const response = await getAddress();
    return response.error ? null : response.address;
  } catch {
    return null;
  }
}

export async function signWithFreighter(
  xdr: string,
  address: string,
  network: CrownFiStellarNetwork = "testnet",
): Promise<{ signedXdr?: string; error?: string }> {
  const response = await signTransaction(xdr, {
    networkPassphrase: networkPassphrase(network),
    address,
  });
  if (response.error) return { error: errMsg(response.error) };
  return { signedXdr: response.signedTxXdr };
}

export async function signWalletMessage(
  message: string,
  address: string,
): Promise<{ signature?: string; error?: string }> {
  const response = await signMessage(message, { address });
  if (response.error) {
    return { error: errMsg(response.error) || "Message signing was rejected." };
  }
  if (!response.signedMessage) return { error: "No signature was returned by Freighter." };
  const signature =
    typeof response.signedMessage === "string"
      ? response.signedMessage
      : bytesToBase64(response.signedMessage);
  return { signature };
}

export const signAdminMessage = signWalletMessage;
