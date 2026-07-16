"use client";

import { useEffect, useState } from "react";
import { PageantHomeExperience, type PageantHomeCategory, type PageantHomeContestant, type PageantHomePageant } from "./PageantHomeExperience";
import { normalizePageantHomeWidgets, type PageantHomeWidget } from "@/lib/pageantHome";

const storageKey = (pageantId: string) => `crownfi:pageant-home-draft:${pageantId}`;

export function PageantHomeRoute({
  pageant,
  organizationName,
  contestants,
  categories,
  widgets,
  editorPreview = false,
}: {
  pageant: PageantHomePageant;
  organizationName: string;
  contestants: PageantHomeContestant[];
  categories: PageantHomeCategory[];
  widgets?: PageantHomeWidget[];
  editorPreview?: boolean;
}) {
  const [layout, setLayout] = useState<PageantHomeWidget[] | undefined>(widgets);

  useEffect(() => {
    if (!editorPreview) {
      setLayout(widgets);
      return;
    }

    const raw = window.localStorage.getItem(storageKey(pageant.id));
    if (!raw) {
      setLayout(widgets);
      return;
    }

    try {
      setLayout(normalizePageantHomeWidgets(JSON.parse(raw)));
    } catch {
      setLayout(widgets);
    }
  }, [editorPreview, pageant.id, widgets]);

  return (
    <PageantHomeExperience
      pageant={pageant}
      organizationName={organizationName}
      contestants={contestants}
      categories={categories}
      widgets={layout}
      preview={editorPreview}
    />
  );
}
