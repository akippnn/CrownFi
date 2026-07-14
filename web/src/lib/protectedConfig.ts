import "server-only";

import { createCipheriv, createHash, randomBytes } from "crypto";

function material(): Buffer {
  const configured = process.env.CROWNFI_CONFIG_PROTECTION_KEY;
  if (configured) {
    if (/^[0-9a-fA-F]{64}$/.test(configured)) return Buffer.from(configured, "hex");
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
    throw new Error("CROWNFI_CONFIG_PROTECTION_KEY must encode exactly 32 bytes");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CROWNFI_CONFIG_PROTECTION_KEY is required in production");
  }
  return createHash("sha256")
    .update("local-development-config-protection-change-before-sharing")
    .digest();
}

export function sealConfig(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material(), iv);
  const body = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function displaySuffix(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(-4) : null;
}
