"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Monitor, RotateCcw, Save, Smartphone } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Notice,
  TextareaField,
  TextField,
} from "@/components/ui-kit";
import {
  defaultPageantHomeWidgets,
  normalizePageantHomeWidgets,
  pageantHomeWidgetDefinition,
  type PageantHomeWidget,
  type PageantHomeWidgetId,
  type PageantHomeWidgetSettings,
} from "@/lib/pageantHome";

const storageKey = (pageantId: string) => `crownfi:pageant-home-draft:${pageantId}`;

function cloneDefaults() {
  return defaultPageantHomeWidgets.map((widget) => ({
    ...widget,
    settings: { ...widget.settings },
  }));
}

export function PageantHomeEditor({
  pageant,
  organizationName,
}: {
  pageant: { id: string; name: string; status: string };
  organizationName: string;
}) {
  const [draft, setDraft] = useState<PageantHomeWidget[]>(cloneDefaults);
  const [applied, setApplied] = useState<PageantHomeWidget[]>(cloneDefaults);
  const [selectedId, setSelectedId] = useState<PageantHomeWidgetId>("hero");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(pageant.id));
    if (!raw) {
      const defaults = cloneDefaults();
      setDraft(defaults);
      setApplied(defaults);
      setSaved(false);
      return;
    }
    try {
      const restored = normalizePageantHomeWidgets(JSON.parse(raw));
      setDraft(restored);
      setApplied(restored);
      setSaved(true);
    } catch {
      const defaults = cloneDefaults();
      setDraft(defaults);
      setApplied(defaults);
      setSaved(false);
    }
  }, [pageant.id]);

  const selected = draft.find((widget) => widget.id === selectedId) ?? draft[0];
  const definition = pageantHomeWidgetDefinition(selected.id);
  const previewUrl = `/platform/pageants/${pageant.id}?editorPreview=1`;
  const enabledCount = draft.filter((widget) => widget.enabled).length;
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied]);

  function updateWidget(id: PageantHomeWidgetId, update: (widget: PageantHomeWidget) => PageantHomeWidget) {
    setSaved(false);
    setDraft((current) => current.map((widget) => widget.id === id ? update(widget) : widget));
  }

  function move(id: PageantHomeWidgetId, offset: -1 | 1) {
    setSaved(false);
    setDraft((current) => {
      const index = current.findIndex((widget) => widget.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateSetting(key: keyof PageantHomeWidgetSettings, value: string) {
    updateWidget(selected.id, (widget) => ({
      ...widget,
      settings: { ...widget.settings, [key]: value },
    }));
  }

  function applyDraft() {
    const normalized = normalizePageantHomeWidgets(draft);
    window.localStorage.setItem(storageKey(pageant.id), JSON.stringify(normalized));
    setDraft(normalized);
    setApplied(normalized);
    setSaved(true);
  }

  function reset() {
    const defaults = cloneDefaults();
    window.localStorage.removeItem(storageKey(pageant.id));
    setDraft(defaults);
    setApplied(defaults);
    setSelectedId("hero");
    setSaved(false);
  }

  return (
    <div className="space-y-5">
      <Notice tone="gold" title="Shared-renderer editor">
        The preview loads the actual public pageant route inside a device frame. The editor does not recreate the user interface; both surfaces use the same pageant widget renderer and existing UI-kit components.
      </Notice>

      <div className="grid min-h-[720px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Pageant home widgets</CardTitle>
                  <CardDescription>{enabledCount} of {draft.length} widgets visible for {pageant.name}.</CardDescription>
                </div>
                <Badge tone={pageant.status === "published" ? "success" : "gold"}>{pageant.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {draft.map((widget, index) => {
                const item = pageantHomeWidgetDefinition(widget.id);
                const active = selected.id === widget.id;
                return (
                  <div
                    key={widget.id}
                    className={`rounded-2xl border p-3 transition ${active ? "border-gold/50 bg-gold/10" : "border-line bg-black/25"}`}
                  >
                    <button type="button" className="w-full text-left" onClick={() => setSelectedId(widget.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{item.label}</div>
                          <div className="mt-1 text-xs leading-5 text-gold-soft/40">{item.description}</div>
                        </div>
                        <Badge tone={widget.enabled ? "success" : "neutral"}>{widget.enabled ? "Visible" : "Hidden"}</Badge>
                      </div>
                    </button>
                    <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                      <Button size="sm" variant="ghost" onClick={() => move(widget.id, -1)} disabled={index === 0} aria-label={`Move ${item.label} up`}><ArrowUp size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => move(widget.id, 1)} disabled={index === draft.length - 1} aria-label={`Move ${item.label} down`}><ArrowDown size={14} /></Button>
                      <Button
                        size="sm"
                        variant={widget.enabled ? "secondary" : "primary"}
                        className="ml-auto"
                        onClick={() => updateWidget(widget.id, (current) => ({ ...current, enabled: !current.enabled }))}
                      >
                        {widget.enabled ? <EyeOff size={14} /> : <Eye size={14} />}
                        {widget.enabled ? "Hide" : "Show"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{definition.label}</CardTitle>
              <CardDescription>Text overrides remain optional; blank values fall back to pageant data and CrownFi defaults.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {definition.editable.length === 0 ? (
                <p className="text-sm leading-6 text-gold-soft/45">This widget uses pageant-aware links and organization identity automatically.</p>
              ) : (
                definition.editable.map((key) => key === "description" ? (
                  <TextareaField
                    key={key}
                    id={`widget-${selected.id}-${key}`}
                    label="Description"
                    value={selected.settings[key] || ""}
                    onChange={(event) => updateSetting(key, event.target.value)}
                    placeholder="Use the pageant default"
                  />
                ) : (
                  <TextField
                    key={key}
                    id={`widget-${selected.id}-${key}`}
                    label={key === "ctaText" ? "Action label" : key[0].toUpperCase() + key.slice(1)}
                    value={selected.settings[key] || ""}
                    onChange={(event) => updateSetting(key, event.target.value)}
                    placeholder="Use the pageant default"
                  />
                ))
              )}
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button onClick={applyDraft} disabled={!changed}>
                  <Save size={15} /> {saved && !changed ? "Preview draft saved" : "Apply to preview"}
                </Button>
                <Button variant="ghost" onClick={reset}><RotateCcw size={15} /> Reset</Button>
              </div>
              <p className="text-xs leading-5 text-gold-soft/35">
                This branch stores the editable layout as a pageant-scoped browser draft while the durable pageant configuration write model is completed. Applying the draft updates the exact-route preview; it does not publish the layout to other users.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="border-b border-line">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Exact public experience</CardTitle>
                <CardDescription>{organizationName} · {pageant.name}</CardDescription>
              </div>
              <div className="flex rounded-2xl border border-line bg-black/35 p-1">
                <Button size="sm" variant={device === "desktop" ? "primary" : "ghost"} onClick={() => setDevice("desktop")}><Monitor size={15} /> Desktop</Button>
                <Button size="sm" variant={device === "mobile" ? "primary" : "ghost"} onClick={() => setDevice("mobile")}><Smartphone size={15} /> Mobile</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-[680px] overflow-auto bg-[#111116] p-3 sm:p-5">
            <div className={`mx-auto overflow-hidden border border-white/10 bg-[#070708] shadow-2xl transition-all ${device === "mobile" ? "w-[390px] max-w-full rounded-[2rem]" : "w-full rounded-2xl"}`}>
              <iframe
                key={`${pageant.id}-${device}-${JSON.stringify(applied)}`}
                title={`${pageant.name} ${device} preview`}
                src={previewUrl}
                className={device === "mobile" ? "h-[760px] w-full" : "h-[820px] w-full"}
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
