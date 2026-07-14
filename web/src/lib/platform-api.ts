import "server-only";

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type PlatformPageant = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  timezone: string;
  venue_name?: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type PlatformCategory = {
  id: string;
  pageant_id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PlatformContestant = {
  id: string;
  pageant_id: string;
  contestant_id: string;
  display_name: string;
  legal_name?: string | null;
  biography?: string | null;
  country_code?: string | null;
  sash?: string | null;
  contestant_number?: number | null;
  country_representation?: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PlatformContestantSection = {
  id: string;
  pageant_contestant_id: string;
  kind: string;
  title: string;
  slug: string;
  sort_order: number;
  is_visible: boolean;
  settings_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PlatformMediaAsset = {
  id: string;
  organization_id: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  width?: number | null;
  height?: number | null;
  sha256: string;
  visibility: string;
  status: string;
  alt_text?: string | null;
  delivery_url?: string | null;
};

export type PlatformContestantMedia = {
  attachment_id: string;
  pageant_contestant_id: string;
  role: "portrait" | "banner" | "gallery" | "section";
  caption?: string | null;
  sort_order: number;
  created_at: string;
  asset: PlatformMediaAsset;
};

export type PlatformPageantGroup = {
  organization: PlatformOrganization;
  pageants: PlatformPageant[];
};

const API_BASE = (
  process.env.CROWNFI_API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8080"
).replace(/\/$/, "");

export async function platformGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getPlatformPageantGroups(): Promise<PlatformPageantGroup[]> {
  const organizations = await platformGet<PlatformOrganization[]>("/platform/organizations", []);
  return Promise.all(
    organizations.map(async (organization) => ({
      organization,
      pageants: await platformGet<PlatformPageant[]>(
        `/platform/organizations/${organization.id}/pageants`,
        [],
      ),
    })),
  );
}

export async function findPlatformPageant(pageantId: string) {
  const groups = await getPlatformPageantGroups();
  for (const group of groups) {
    const pageant = group.pageants.find((item) => item.id === pageantId);
    if (pageant) return { organization: group.organization, pageant };
  }
  return null;
}
