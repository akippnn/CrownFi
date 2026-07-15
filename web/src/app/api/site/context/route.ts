import { NextResponse } from "next/server";
import { crownfiPublicFetch, responseJson } from "@/lib/crownfi-internal";

export async function GET() {
  const settingsResponse = await crownfiPublicFetch("/setup/status");
  const settings = await responseJson(settingsResponse);
  const organizationsResponse = await crownfiPublicFetch("/platform/organizations");
  const organizations = organizationsResponse.ok ? await responseJson(organizationsResponse) : [];

  const groups = await Promise.all(
    (Array.isArray(organizations) ? organizations : []).map(async (organization: any) => {
      const response = await crownfiPublicFetch(`/platform/organizations/${organization.id}/pageants`);
      const pageants = response.ok ? await responseJson(response) : [];
      return (Array.isArray(pageants) ? pageants : [])
        .filter((pageant: any) => ["published", "active"].includes(pageant.status))
        .map((pageant: any) => ({
          id: pageant.id,
          name: pageant.name,
          slug: pageant.slug,
          organization_id: organization.id,
          organization_name: organization.name,
          status: pageant.status,
        }));
    }),
  );

  return NextResponse.json({
    site_name: settings.site_name || "CrownFi",
    stellar_network: settings.stellar_network === "public" ? "public" : "testnet",
    setup_required: Boolean(settings.setup_required),
    default_pageant_id: settings.default_pageant_id || null,
    pageant_selector_enabled: Boolean(settings.pageant_selector_enabled),
    pageants: groups.flat(),
  });
}
