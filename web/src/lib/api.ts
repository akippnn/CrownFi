// Client-side fetch helper.
//
// Why this exists: pages fetch data on mount. If the API returns a non-OK response
// (e.g. the database is not configured yet, or a transient 5xx), calling `r.json()`
// on an empty/HTML body throws "Unexpected end of JSON input" and crashes the page.
// `getJson` never throws — on any failure it resolves to the supplied fallback, so a
// page renders its empty state instead of a runtime error overlay.
export async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const text = await res.text();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

// POST helper that always resolves to a parsed body (or a typed error), never throws.
export async function postJson<T = any>(
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: T | { error?: string } }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "network_error" } };
  }
}
