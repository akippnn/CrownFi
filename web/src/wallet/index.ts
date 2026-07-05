import { randomBytes } from "crypto";

// Wallet abstraction. The rest of the app depends only on this interface, so the underlying
// provider can be swapped (mock -> Privy -> Passkey Kit smart wallets) without touching app code.
//
// TESTNET NOW: fans connect the Freighter browser extension client-side (see
// src/wallet/freighter.ts + components/FreighterButton.tsx). Their real Testnet address is saved
// to the Fan record and used as the mint destination. This server adapter's mock path is only the
// fallback for fans who have not connected a wallet. Privy embedded wallets remain the later option
// for mainstream users who do not have an extension.

export interface WalletProvider {
  name: string;
  // Returns (creating if needed) the Stellar address associated with a fan handle.
  ensureAddress(fanHandle: string): Promise<string>;
}

class MockWallet implements WalletProvider {
  name = "mock";
  private map = new Map<string, string>();
  async ensureAddress(fanHandle: string): Promise<string> {
    if (!this.map.has(fanHandle)) {
      // A plausible-looking Stellar public key shape (G...) for local testing only.
      const addr = "G" + randomBytes(28).toString("hex").toUpperCase().slice(0, 55);
      this.map.set(fanHandle, addr);
    }
    return this.map.get(fanHandle)!;
  }
}

// -----------------------------------------------------------------------------
// PrivyWallet: auto-provisions a Stellar wallet for each fan, with NO seed phrase.
//
// Why there is no seed phrase:
//  - Privy is auth-first. The fan signs in with Google, email, or a passkey, and Privy
//    provisions an embedded wallet behind that login. The fan never sees, writes down, or
//    handles a secret key or seed phrase.
//  - Keys are generated and split (Shamir secret sharing) and only ever reassembled inside a
//    Trusted Execution Environment (TEE). Neither Privy nor CrownFi ever holds the full private
//    key, so the wallet is self-custodial yet completely seedphrase-free.
//  - Recovery is tied to the login method (Google / email / passkey), not to a phrase. NOTE: the
//    device share does not travel across browsers or devices, so prompt the fan to set up
//    recovery during onboarding, or a new device forces a recovery step.
//
// The one Stellar-specific detail (important):
//  - Privy's DEFAULT embedded wallet is EVM (and optionally Solana). Stellar uses ed25519 keys,
//    so a Stellar address is NOT the same key as the default EVM wallet and is NOT created just
//    by enabling Google login. We EXPLICITLY create a Stellar wallet for the fan below
//    (chainType "stellar"). Doing that once in the signup flow is what makes
//    "every Google signup automatically gets a Stellar address" true for CrownFi.
//  - Fans never need XLM: cover account creation and reserves with SPONSORED RESERVES from the
//    platform account (handled on the Stellar side, not by Privy).
//  - Production must be served over HTTPS. Privy's key handling fails silently on plain http
//    (localhost is exempt for local dev).
//
// Wiring steps:
//  1. Set PRIVY_APP_ID and PRIVY_APP_SECRET (server-only) in web/.env.
//  2. npm i @privy-io/server-auth
//  3. Store each fan's Privy user id on the Fan record at first login, and map
//     fanHandle -> privyUserId here (the mock adapter is used until then).
//  4. Confirm the current Stellar wallet-creation call against Privy's docs; the API moves fast.
// -----------------------------------------------------------------------------
class PrivyWallet implements WalletProvider {
  name = "privy";

  async ensureAddress(fanHandle: string): Promise<string> {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error(
        "WALLET_PROVIDER=privy but PRIVY_APP_ID / PRIVY_APP_SECRET are not set. " +
          "Add them to web/.env, or use WALLET_PROVIDER=mock for offline testing."
      );
    }

    // Dynamic import via a string-typed specifier so the project still typechecks and builds
    // before @privy-io/server-auth is installed. Once installed, this resolves normally.
    const pkg: string = "@privy-io/server-auth";
    const mod: any = await import(pkg).catch(() => {
      throw new Error("Install the Privy server SDK first:  npm i @privy-io/server-auth");
    });
    const privy = new mod.PrivyClient(appId, appSecret);

    // In production, resolve the fan's Privy user id (stored on the Fan record at first login)
    // rather than passing the handle. Create-or-fetch that user's Stellar wallet and return it.
    // Field names follow Privy's server wallet API; confirm against current docs.
    const wallet = await privy.walletApi.createWallet({ chainType: "stellar", owner: { userId: fanHandle } });
    return wallet.address as string;
  }
}

let instance: WalletProvider | null = null;
export function getWallet(): WalletProvider {
  if (instance) return instance;
  instance = process.env.WALLET_PROVIDER === "privy" ? new PrivyWallet() : new MockWallet();
  return instance;
}
