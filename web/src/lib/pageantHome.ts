export const PAGEANT_HOME_WIDGET_IDS = [
  "hero",
  "delegates",
  "categories",
  "collectible",
  "tickets",
  "about",
  "footer",
] as const;

export type PageantHomeWidgetId = (typeof PAGEANT_HOME_WIDGET_IDS)[number];

export type PageantHomeWidgetSettings = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  ctaText?: string;
};

export type PageantHomeWidget = {
  id: PageantHomeWidgetId;
  enabled: boolean;
  settings: PageantHomeWidgetSettings;
};

export type PageantHomeWidgetDefinition = {
  id: PageantHomeWidgetId;
  label: string;
  description: string;
  editable: Array<keyof PageantHomeWidgetSettings>;
};

export const pageantHomeWidgetDefinitions: PageantHomeWidgetDefinition[] = [
  {
    id: "hero",
    label: "Pageant hero",
    description: "Primary identity, event promise, and first call to action.",
    editable: ["eyebrow", "title", "subtitle", "description", "ctaText"],
  },
  {
    id: "delegates",
    label: "Delegate showcase",
    description: "The reusable delegate carousel from the original CrownFi landing experience.",
    editable: ["eyebrow", "title", "description"],
  },
  {
    id: "categories",
    label: "Competition categories",
    description: "Explains the active categories and segments configured for the pageant.",
    editable: ["eyebrow", "title", "description"],
  },
  {
    id: "collectible",
    label: "Featured collectible",
    description: "Highlights one contestant collectible using the shared collectible presentation.",
    editable: ["eyebrow", "title", "description", "ctaText"],
  },
  {
    id: "tickets",
    label: "Ticket promotion",
    description: "Promotes reserved seating and verified event passes.",
    editable: ["title", "description", "ctaText"],
  },
  {
    id: "about",
    label: "About the pageant",
    description: "Organization story, platform trust framing, and host-pageant call to action.",
    editable: ["eyebrow", "title", "description", "ctaText"],
  },
  {
    id: "footer",
    label: "Pageant footer",
    description: "Pageant-aware links, organizer identity, and platform attribution.",
    editable: [],
  },
];

export const defaultPageantHomeWidgets: PageantHomeWidget[] = [
  {
    id: "hero",
    enabled: true,
    settings: {
      eyebrow: "CrownFi Pageant Experience",
      subtitle: "VOTE · ATTEND · SUPPORT · VERIFY",
      ctaText: "Cast your vote",
    },
  },
  {
    id: "delegates",
    enabled: true,
    settings: {
      eyebrow: "Official lineup",
      title: "Meet the delegates",
      description: "Explore the official contestants and open the experience built around your chosen queen.",
    },
  },
  {
    id: "categories",
    enabled: true,
    settings: {
      eyebrow: "Competition format",
      title: "Pageant categories",
      description: "Every category is configured by the organizer and remains tied to this pageant context.",
    },
  },
  {
    id: "collectible",
    enabled: true,
    settings: {
      eyebrow: "Featured collectible",
      description: "Support an official contestant through a limited digital keepsake tied to the CrownFi experience.",
      ctaText: "View collectibles",
    },
  },
  {
    id: "tickets",
    enabled: true,
    settings: {
      title: "Reserved seating and verified passes",
      description: "Choose a tier, receive a verifiable event pass, and assign the seat attached to your ticket.",
      ctaText: "Browse tickets",
    },
  },
  {
    id: "about",
    enabled: true,
    settings: {
      eyebrow: "Pageant overview",
      title: "About this CrownFi experience",
      ctaText: "Explore all pageants",
    },
  },
  {
    id: "footer",
    enabled: true,
    settings: {},
  },
];

const widgetIds = new Set<string>(PAGEANT_HOME_WIDGET_IDS);

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function cleanSettings(value: unknown): PageantHomeWidgetSettings {
  const settings = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    eyebrow: cleanText(settings.eyebrow, 120),
    title: cleanText(settings.title, 200),
    subtitle: cleanText(settings.subtitle, 220),
    description: cleanText(settings.description, 1200),
    ctaText: cleanText(settings.ctaText, 80),
  };
}

export function normalizePageantHomeWidgets(value: unknown): PageantHomeWidget[] {
  const candidates = Array.isArray(value) ? value : [];
  const normalized: PageantHomeWidget[] = [];
  const seen = new Set<PageantHomeWidgetId>();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const id = typeof item.id === "string" && widgetIds.has(item.id)
      ? item.id as PageantHomeWidgetId
      : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fallback = defaultPageantHomeWidgets.find((widget) => widget.id === id)!;
    normalized.push({
      id,
      enabled: typeof item.enabled === "boolean" ? item.enabled : fallback.enabled,
      settings: { ...fallback.settings, ...cleanSettings(item.settings) },
    });
  }

  for (const fallback of defaultPageantHomeWidgets) {
    if (!seen.has(fallback.id)) {
      normalized.push({
        id: fallback.id,
        enabled: fallback.enabled,
        settings: { ...fallback.settings },
      });
    }
  }

  return normalized;
}

export function pageantHomeWidgetDefinition(id: PageantHomeWidgetId) {
  return pageantHomeWidgetDefinitions.find((definition) => definition.id === id)!;
}
