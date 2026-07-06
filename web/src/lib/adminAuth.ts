import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE = "crownfi_admin";
const SESSION_TTL_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SEP53_PREFIX = "Stellar Signed Message:\n";

type Challenge = { address: string; expiresAt: number };
type SessionPayload = { address: string; exp: number; iat: number };

const challenges = new Map<string, Challenge>();

export function adminAllowlist(): string[] {
  return (process.env.ADMIN_WALLETS ?? process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isLikelyStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

export function isAdminAddress(address: string): boolean {
  return adminAllowlist().includes(address);
}

function appOrigin(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    req.headers.get("origin") ||
    `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host") ?? "localhost:3000"}`
  );
}

export function createAdminChallenge(address: string, req: NextRequest): { nonce: string; message: string; expiresAt: number } {
  const nonce = randomBytes(24).toString("base64url");
  const now = Date.now();
  const expiresAt = now + CHALLENGE_TTL_MS;
  challenges.set(nonce, { address, expiresAt });

  const message = [
    "CrownFi admin authorization",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Origin: ${appOrigin(req)}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");

  return { nonce, message, expiresAt };
}

function extractNonce(message: string): string | null {
  const match = message.match(/^Nonce: ([A-Za-z0-9_-]+)$/m);
  return match?.[1] ?? null;
}

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET is required in production");
  }

  return "dev-only-crownfi-admin-session-secret-change-before-deploy";
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function sep53Hash(message: string): Buffer {
  return createHash("sha256").update(SEP53_PREFIX).update(Buffer.from(message, "utf8")).digest();
}

export async function verifyAdminSignature(params: {
  address: string;
  message: string;
  signature: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { address, message, signature } = params;
  if (!isLikelyStellarAddress(address)) return { ok: false, error: "invalid_address", status: 400 };
  if (!isAdminAddress(address)) return { ok: false, error: "not_admin", status: 403 };

  const nonce = extractNonce(message);
  if (!nonce) return { ok: false, error: "missing_nonce", status: 400 };

  const challenge = challenges.get(nonce);
  challenges.delete(nonce); // one-time use, successful or not
  if (!challenge || challenge.address !== address) return { ok: false, error: "invalid_challenge", status: 401 };
  if (Date.now() > challenge.expiresAt) return { ok: false, error: "challenge_expired", status: 401 };

  try {
    const sdk: any = await import("@stellar/stellar-sdk");
    const keypair = sdk.Keypair.fromPublicKey(address);
    const valid = keypair.verify(sep53Hash(message), Buffer.from(signature, "base64"));
    if (!valid) return { ok: false, error: "bad_signature", status: 401 };
    return { ok: true };
  } catch {
    return { ok: false, error: "signature_verify_failed", status: 400 };
  }
}

export function createAdminSession(address: string): string {
  const now = Date.now();
  const payload: SessionPayload = { address, iat: now, exp: now + SESSION_TTL_MS };
  const encoded = base64url(JSON.stringify(payload));
  return `v1.${encoded}.${signPayload(encoded)}`;
}

export function setAdminCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearAdminCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function readAdminSession(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;

  const [version, encoded, sig] = token.split(".");
  if (version !== "v1" || !encoded || !sig) return null;
  if (!safeEqual(signPayload(encoded), sig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.address || !payload.exp || Date.now() > payload.exp) return null;
    if (!isAdminAddress(payload.address)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAdmin(req: NextRequest): { address: string } | NextResponse {
  const session = readAdminSession(req);
  if (!session) return NextResponse.json({ error: "admin_auth_required" }, { status: 401 });
  return { address: session.address };
}
