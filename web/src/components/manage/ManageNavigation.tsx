"use client";

import { useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  Gem,
  Images,
  LayoutDashboard,
  PanelsTopLeft,
  Settings2,
  Tags,
  Ticket,
  UserCog,
  UsersRound,
  Vote,
} from "lucide-react";
import { Badge, Card, CardContent, SelectField } from "@/components/ui-kit";
import {
  manageModules,
  type ManageModule,
  type ManageModuleId,
  visibleManageModules,
} from "@/lib/crownfiModules";

const groupLabels: Record<ManageModule["group"], string> = {
  workspace: "Pageant workspace",
  experience: "Experience modules",
  administration: "Administration",
};

const icons = {
  overview: LayoutDashboard,
  home: PanelsTopLeft,
  pageants: Building2,
  contestants: UsersRound,
  categories: Tags,
  media: Images,
  voting: Vote,
  tickets: Ticket,
  markets: BarChart3,
  collectibles: Gem,
  people: UserCog,
  site: Settings2,
} satisfies Record<ManageModuleId, typeof LayoutDashboard>;

function availabilityLabel(module: ManageModule) {
  if (module.availability === "available") return null;
  if (module.availability === "preview") return `Milestone ${module.milestone} preview`;
  return `Milestone ${module.milestone}`;
}

export function ManageNavigation({
  activeModule,
  isSiteAdmin,
  canManageMembers,
}: {
  activeModule: ManageModuleId;
  onSelect?: (module: ManageModuleId) => void;
  isSiteAdmin: boolean;
  canManageMembers: boolean;
}) {
  const router = useRouter();
  const modules = visibleManageModules({ isSiteAdmin, canManageMembers });
  const active = manageModules.find((module) => module.id === activeModule) ?? modules[0];
  const groups = (Object.keys(groupLabels) as ManageModule["group"][])
    .map((group) => ({ group, modules: modules.filter((module) => module.group === group) }))
    .filter((entry) => entry.modules.length > 0);

  function select(module: ManageModuleId) {
    if (module === activeModule) return;
    router.push(`/manage?module=${module}`, { scroll: false });
  }

  return (
    <>
      <Card className="lg:hidden">
        <CardContent className="pt-5">
          <SelectField
            id="manage-module-mobile"
            label="Control-panel section"
            value={activeModule}
            onChange={(event) => select(event.target.value as ManageModuleId)}
          >
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.shortLabel}{module.availability === "available" ? "" : ` · Milestone ${module.milestone}`}
              </option>
            ))}
          </SelectField>
          {active && <p className="mt-3 text-xs leading-5 text-gold-soft/45">{active.description}</p>}
        </CardContent>
      </Card>

      <aside className="hidden h-full min-h-[calc(100vh-86px)] border-r border-line bg-[#09090b] px-3 py-5 lg:block" aria-label="Manage modules">
        <div className="sticky top-[102px] space-y-5">
          {groups.map(({ group, modules: groupModules }) => (
            <div key={group}>
              <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-soft/30">
                {groupLabels[group]}
              </div>
              <div className="space-y-1">
                {groupModules.map((module) => {
                  const Icon = icons[module.id];
                  const selected = module.id === activeModule;
                  const stateLabel = availabilityLabel(module);
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => select(module.id)}
                      aria-current={selected ? "page" : undefined}
                      className={`w-full rounded-2xl px-3 py-3 text-left transition ${
                        selected
                          ? "bg-gold text-black shadow-[0_10px_30px_-18px_rgba(212,175,55,0.8)]"
                          : "text-gold-soft/65 hover:bg-gold/10 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-black/10" : "bg-white/[0.04]"}`}>
                          <Icon size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{module.shortLabel}</span>
                          {stateLabel && (
                            <Badge
                              tone={selected ? "neutral" : module.availability === "preview" ? "gold" : "neutral"}
                              emphasis="soft"
                              className={`mt-1.5 ${selected ? "bg-black/10 text-black" : ""}`}
                            >
                              {stateLabel}
                            </Badge>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
