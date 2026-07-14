import "server-only";

const API_BASE = (
  process.env.CROWNFI_API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8080"
).replace(/\/$/, "");

function localProfile(): boolean {
  return (process.env.CROWNFI_API_MODE ?? "local") === "local";
}

function internalToken(): string {
  const value = process.env.CROWNFI_WEB_INTERNAL_TOKEN;
  if (value) return value;
  if (process.env.NODE_ENV === "production" && !localProfile()) {
    throw new Error("CROWNFI_WEB_INTERNAL_TOKEN is required outside the local profile");
  }
  return "local-web-to-api-token-change-before-sharing";
}

export async function crownfiInternalFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("x-crownfi-web-token", internalToken());
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function crownfiPublicFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function responseJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: "invalid_api_response" };
  }
}
