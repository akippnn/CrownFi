export type ModuleAvailability = "available" | "preview" | "planned";

export type PublicPageantModuleId =
  | "overview"
  | "contestants"
  | "vote"
  | "tickets"
  | "predict"
  | "results";

export type ManageModuleId =
  | "overview"
  | "home"
  | "pageants"
  | "contestants"
  | "categories"
  | "media"
  | "voting"
  | "tickets"
  | "markets"
  | "collectibles"
  | "people"
  | "site";

export type PublicPageantModule = {
  id: PublicPageantModuleId;
  label: string;
  mobileLabel: string;
  href: (pageantId: string) => string;
};

export type ManageModule = {
  id: ManageModuleId;
  label: string;
  shortLabel: string;
  description: string;
  group: "workspace" | "experience" | "administration";
  availability: ModuleAvailability;
  milestone: "B" | "C" | "D" | "E" | "F";
  visibility: "organizer" | "membership-admin" | "site-admin";
};

export const publicPageantModules: PublicPageantModule[] = [
  {
    id: "overview",
    label: "Home",
    mobileLabel: "Pageant",
    href: (pageantId) => `/platform/pageants/${pageantId}`,
  },
  {
    id: "contestants",
    label: "Contestants",
    mobileLabel: "Contestants",
    href: (pageantId) => `/platform/pageants/${pageantId}#contestants`,
  },
  {
    id: "vote",
    label: "Vote",
    mobileLabel: "Vote",
    href: (pageantId) => `/vote?pageant=${pageantId}`,
  },
  {
    id: "tickets",
    label: "Tickets",
    mobileLabel: "Tickets",
    href: (pageantId) => `/tickets?pageant=${pageantId}`,
  },
  {
    id: "predict",
    label: "Predict",
    mobileLabel: "Predict",
    href: (pageantId) => `/pageants/${pageantId}/predict`,
  },
  {
    id: "results",
    label: "Results",
    mobileLabel: "Results",
    href: (pageantId) => `/pageants/${pageantId}/results`,
  },
];

export const manageModules: ManageModule[] = [
  {
    id: "overview",
    label: "Workspace overview",
    shortLabel: "Overview",
    description: "See the active organization, pageant context, readiness, and the next safe action.",
    group: "workspace",
    availability: "available",
    milestone: "B",
    visibility: "organizer",
  },
  {
    id: "home",
    label: "Pageant home editor",
    shortLabel: "Home editor",
    description: "Compose the public pageant home from reusable widgets and preview the exact user-facing route on desktop or mobile.",
    group: "workspace",
    availability: "available",
    milestone: "B",
    visibility: "organizer",
  },
  {
    id: "pageants",
    label: "Pageants",
    shortLabel: "Pageants",
    description: "Create persistent pageant drafts and choose the pageant being managed.",
    group: "workspace",
    availability: "available",
    milestone: "B",
    visibility: "organizer",
  },
  {
    id: "contestants",
    label: "Contestants",
    shortLabel: "Contestants",
    description: "Add contestants to the selected pageant. Editing, ordering, sections, and visibility remain in the platform milestone.",
    group: "workspace",
    availability: "available",
    milestone: "B",
    visibility: "organizer",
  },
  {
    id: "categories",
    label: "Categories & segments",
    shortLabel: "Categories",
    description: "Create pageant categories now; outfit membership, ordering, and visibility continue in Milestone B.",
    group: "workspace",
    availability: "available",
    milestone: "B",
    visibility: "organizer",
  },
  {
    id: "media",
    label: "Media library",
    shortLabel: "Media",
    description: "R2 upload and attachment APIs exist; the browser library and asset picker are the remaining Milestone B workflow.",
    group: "workspace",
    availability: "preview",
    milestone: "B",
    visibility: "organizer",
  },
  {
    id: "voting",
    label: "Voting",
    shortLabel: "Voting",
    description: "Round setup, eligibility, intake, receipts, and Stellar anchoring belong to the Voting milestone.",
    group: "experience",
    availability: "planned",
    milestone: "C",
    visibility: "organizer",
  },
  {
    id: "tickets",
    label: "Ticketing",
    shortLabel: "Tickets",
    description: "Ticket products, inventory, issuance, ownership, and check-in belong to the Ticketing milestone.",
    group: "experience",
    availability: "planned",
    milestone: "D",
    visibility: "organizer",
  },
  {
    id: "markets",
    label: "Prediction markets",
    shortLabel: "Markets",
    description: "Market policy, positions, settlement, and governance UX belong to the Prediction Market milestone.",
    group: "experience",
    availability: "preview",
    milestone: "E",
    visibility: "organizer",
  },
  {
    id: "collectibles",
    label: "Collectibles",
    shortLabel: "Collectibles",
    description: "Catalogue definitions, immutable artwork, minting, and ownership UX remain owned by the Collectibles milestone.",
    group: "experience",
    availability: "planned",
    milestone: "F",
    visibility: "organizer",
  },
  {
    id: "people",
    label: "People & roles",
    shortLabel: "People",
    description: "Grant organization-scoped access without exposing site-level authority.",
    group: "administration",
    availability: "available",
    milestone: "B",
    visibility: "membership-admin",
  },
  {
    id: "site",
    label: "Site administration",
    shortLabel: "Site",
    description: "Control hosted context, network readiness, and masked integration status as a site administrator.",
    group: "administration",
    availability: "available",
    milestone: "B",
    visibility: "site-admin",
  },
];

export function isManageModuleId(value: string | null): value is ManageModuleId {
  return Boolean(value && manageModules.some((module) => module.id === value));
}

export function visibleManageModules({
  isSiteAdmin,
  canManageMembers,
}: {
  isSiteAdmin: boolean;
  canManageMembers: boolean;
}) {
  return manageModules.filter((module) => {
    if (module.visibility === "site-admin") return isSiteAdmin;
    if (module.visibility === "membership-admin") return canManageMembers;
    return true;
  });
}
