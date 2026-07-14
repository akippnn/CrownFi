import { NextRequest, NextResponse } from "next/server";
import { platformAdminPost } from "@/lib/platform-admin";

function value(form: FormData, name: string, required = true) {
  const raw = form.get(name);
  const text = typeof raw === "string" ? raw.trim() : "";
  if (required && !text) throw new Error(`missing_${name}`);
  return text || null;
}

function integerValue(form: FormData, name: string) {
  const text = value(form, name, false);
  if (!text) return undefined;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(parsed)) throw new Error(`invalid_${name}`);
  return parsed;
}

function destination(request: NextRequest, values: Record<string, string | undefined>) {
  const url = new URL("/organizer/review", request.url);
  for (const [key, entry] of Object.entries(values)) {
    if (entry) url.searchParams.set(key, entry);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return destination(request, { error: "invalid_form_data" });
  }

  try {
    const intent = value(form, "intent");

    if (intent === "bootstrap") {
      const result = await platformAdminPost<{
        user: { id: string };
        organization: { id: string; name: string };
      }>(
        "/admin/platform/bootstrap",
        {
          display_name: value(form, "display_name"),
          email: value(form, "email", false),
          organization_name: value(form, "organization_name"),
          organization_slug: value(form, "organization_slug"),
        },
        { actorRequired: false },
      );
      if (!result.ok) return destination(request, { error: result.error });
      return destination(request, {
        status: "organization_created",
        actor_user_id: result.data.user.id,
        organization_id: result.data.organization.id,
      });
    }

    if (intent === "pageant") {
      const organizationId = value(form, "organization_id");
      const result = await platformAdminPost<{ id: string }>(
        `/admin/platform/organizations/${organizationId}/pageants`,
        {
          name: value(form, "name"),
          slug: value(form, "slug"),
          description: value(form, "description", false),
          timezone: value(form, "timezone", false) ?? "Asia/Manila",
          venue_name: value(form, "venue_name", false),
        },
      );
      if (!result.ok) return destination(request, { error: result.error });
      return destination(request, { status: "pageant_created", pageant_id: result.data.id });
    }

    if (intent === "category") {
      const pageantId = value(form, "pageant_id");
      const result = await platformAdminPost<{ id: string }>(
        `/admin/platform/pageants/${pageantId}/categories`,
        {
          name: value(form, "name"),
          slug: value(form, "slug"),
          description: value(form, "description", false),
          sort_order: integerValue(form, "sort_order"),
        },
      );
      if (!result.ok) return destination(request, { error: result.error });
      return destination(request, { status: "category_created", category_id: result.data.id });
    }

    if (intent === "contestant") {
      const pageantId = value(form, "pageant_id");
      const result = await platformAdminPost<{ id: string }>(
        `/admin/platform/pageants/${pageantId}/contestants`,
        {
          display_name: value(form, "display_name"),
          legal_name: value(form, "legal_name", false),
          biography: value(form, "biography", false),
          country_code: value(form, "country_code", false)?.toUpperCase(),
          sash: value(form, "sash", false),
          contestant_number: integerValue(form, "contestant_number"),
          country_representation: value(form, "country_representation", false),
          sort_order: integerValue(form, "sort_order"),
        },
      );
      if (!result.ok) return destination(request, { error: result.error });
      return destination(request, { status: "contestant_created", contestant_id: result.data.id });
    }

    if (intent === "section") {
      const contestantId = value(form, "pageant_contestant_id");
      const body = value(form, "body", false);
      const result = await platformAdminPost<{ id: string }>(
        `/admin/platform/pageant-contestants/${contestantId}/sections`,
        {
          kind: value(form, "kind"),
          title: value(form, "title"),
          slug: value(form, "slug"),
          sort_order: integerValue(form, "sort_order"),
          is_visible: form.get("is_visible") === "on",
          settings_json: body ? { body } : {},
        },
      );
      if (!result.ok) return destination(request, { error: result.error });
      return destination(request, { status: "section_created", section_id: result.data.id });
    }

    return destination(request, { error: "unknown_organizer_intent" });
  } catch (error) {
    return destination(request, {
      error: error instanceof Error ? error.message : "organizer_request_failed",
    });
  }
}
