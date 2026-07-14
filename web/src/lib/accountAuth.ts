import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE = "crownfi_account";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SEP53_PREFIX = "Stellar Signed Message:\n";

export type AccountSession = {
  userId: string;
  currentWallet: string;
  iat: number;
  exp: number;
};

function localProfile(): boolean {
  return (process.env.CROWNFI_API_MODE ?? "local") === "local";
}

function sessionSecret(): string {
  const value = process.env.ACCOUNT_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production" && !localProfile()) {
    throw new Error("ACCOUNT_SESSION_SECRET is required outside the local profile");
  }
  return "local-development-account-session-secret-change-before-sharing";
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAccountSession(userId: string, currentWallet: string): string {
  const now = Date.now();
  const payload: AccountSession = {
    userId,
    currentWallet,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `v1.${encoded}.${signPayload(encoded)}`;
}

export function setAccountCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && !localProfile(),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearAccountCookie(response: NextResponse) {
  response.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && !localProfile(),
    path: "/",
    maxAge: 0,
  });
}

export function readAccountSession(request: NextRequest): AccountSession | null {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const [version, encoded, signature] = token.split(".");
  if (version !== "v1" || !encoded || !signature) return null;
  if (!safeEqual(signPayload(encoded), signature)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as AccountSession;
    if (!payload.userId || !payload.currentWallet || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verifyWalletSignature(params: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  try {
    const sdk: any = await import("@stellar/stellar-sdk");
    const keypair = sdk.Keypair.fromPublicKey(params.address);
    const digest = createHash("sha256")
      .update(SEP53_PREFIX)
      .update(Buffer.from(params.message, "utf8"))
      .digest();
    return keypair.verify(digest, Buffer.from(params.signature, "base64"));
  } catch {
    return false;
  }
}
