import "server-only";

export type PlatformAdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const API_BASE = (
  process.env.CROWNFI_API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8080"
).replace(/\/$/, "");

function enabledValue(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function organizerReviewConfig() {
  return {
    enabled: enabledValue(process.env.CROWNFI_ORGANIZER_REVIEW_ENABLED),
    actorUserId: process.env.CROWNFI_ORGANIZER_ACTOR_USER_ID?.trim() || null,
  };
}

function adminToken() {
  return (
    process.env.CROWNFI_API_ADMIN_TOKEN?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    null
  );
}

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "code"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

export async function platformAdminPost<T>(
  path: string,
  body: Record<string, unknown>,
  options: { actorRequired?: boolean } = {},
): Promise<PlatformAdminResult<T>> {
  const config = organizerReviewConfig();
  if (!config.enabled) {
    return { ok: false, status: 404, error: "organizer_review_disabled" };
  }

  const token = adminToken();
  if (!token) {
    return { ok: false, status: 503, error: "organizer_review_admin_token_missing" };
  }

  const actorRequired = options.actorRequired ?? true;
  if (actorRequired && !config.actorUserId) {
    return { ok: false, status: 503, error: "organizer_review_actor_missing" };
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "x-admin-demo-token": token,
  };
  if (config.actorUserId) headers["x-crownfi-user-id"] = config.actorUserId;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: errorMessage(payload, `platform_admin_request_failed_${response.status}`),
      };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, status: 503, error: "platform_admin_api_unreachable" };
  }
}
