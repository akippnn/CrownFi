# CrownFi frontend UI and mobile hierarchy audit

Status: implementation audit for `ui/modular-mobile-shell-v1`  
Primary tracker: #17 (`B10`, `B17`, `B20`)  
Cross-cutting acceptance: #11

## Goal

CrownFi should have one coherent UI system and one understandable navigation hierarchy while allowing Voting, Ticketing, Prediction Markets, Collectibles, and later domains to ship in their own milestones.

This pass does **not** move feature business logic between milestones. It establishes the shared shell, module registry, context hierarchy, UI primitives, and truthful unavailable states that later feature slices consume.

## Audit result

The repository already contained a useful UI kit, but adoption was uneven.

### Existing canonical UI-kit coverage

`web/src/components/ui-kit/` already provided:

- badges and voting-specific status badges;
- buttons and button links;
- cards and card sections;
- text, select, and textarea fields;
- page sections, section headings, and empty states;
- accessible mobile-bottom-sheet modals and confirmations;
- pageant-specific presentation components such as portraits, carousel, hero, promotional, collectible, and footer sections.

Voting, Ticketing, Collectibles, and the organizer application already consumed substantial parts of this kit.

### Duplicated or page-local UI found

| Surface | Unique implementation found | Risk | Resolution in this branch |
|---|---|---|---|
| App shell | hardcoded pageant links, separate desktop/mobile arrays, stacked mobile context navigation | hierarchy drift and repeated edits per milestone | shared public module registry; pageant links move into the mobile drawer; bottom navigation is reduced to primary destinations |
| Manage | local `Panel`, `TabButton`, and `Input`; three-tab form wall; organization/pageant selector separated from module meaning | difficult mobile scanning; every feature would enlarge one page | modular registry, mobile section selector, grouped desktop navigation, shared context panel, separate module workspaces |
| Setup | local `Field`; long undifferentiated setup form; browser fields for R2 credentials | inconsistent controls and unsafe configuration UX | UI-kit fields/cards/notices; three-step hierarchy; R2 credentials removed from browser setup and documented as deployment secrets |
| Account | bespoke cards, buttons, status pills, and loading/sign-in states | inconsistent identity flow, cramped mobile actions | UI-kit hierarchy, badges, notices, cards, mobile-first wallet actions |
| Legacy UI helper | separate Toast and light-palette heading styles | duplicate status behavior and theme leakage | legacy Toast now re-exports the canonical UI-kit Toast; heading colors align with the submission theme |
| Organizer review console | local form controls and form-card implementation | transitional console can drift from final Manage | documented as remaining migration; do not expand it into the final organizer interface |
| Platform directory/detail pages | bespoke page heroes, cards, pills, and empty states | repeated presentation patterns | retained for now because they are domain presentation, but should migrate to `PageHeader`, `Card`, `Badge`, and `EmptyState` when touched |
| Ticket components | domain components wrapping UI-kit cards/buttons | healthy domain composition | retain; do not flatten into generic components |
| Homepage | UI-kit marketing and pageant-specific components plus one custom promotional panel | mostly intentional marketing composition | retain until a dedicated homepage pass; remove obsolete light-theme utility classes when touched |

## New shared contracts

### Module registry

`web/src/lib/crownfiModules.ts` is the compile-time registry for public pageant navigation and Manage modules.

It records:

- stable module identifier;
- label and mobile label;
- public or Manage placement;
- owning milestone;
- role visibility;
- current availability (`available`, `preview`, or `planned`);
- a truthful description of the boundary.

The registry is navigation and presentation metadata only. It does not authorize actions. The Rust API and centralized capability middleware remain authoritative.

### Manage hierarchy

Desktop:

```text
Manage
├── shared organization/pageant context
├── Pageant workspace
│   ├── Overview
│   ├── Pageants
│   ├── Contestants
│   ├── Categories
│   └── Media
├── Experience modules
│   ├── Voting — Milestone C
│   ├── Ticketing — Milestone D
│   ├── Prediction Markets — Milestone E
│   └── Collectibles — Milestone F
└── Administration
    ├── People & roles
    └── Site administration
```

Mobile:

```text
Top bar
├── menu
├── CrownFi / active pageant
└── wallet/account

Manage page
├── page title and role/network state
├── organization selector
├── pageant selector
├── one workspace-section selector
└── one task-focused module surface

Bottom navigation
├── Explore
├── Pageant (when context exists)
├── Manage (authorized users)
└── Account
```

The former pageant horizontal navigation is desktop-only. On mobile, secondary pageant actions live in the drawer so the user is not asked to understand a top bar, second horizontal bar, page tabs, and bottom bar simultaneously.

## UI-kit additions

This branch adds:

- `PageHeader`: consistent responsive page-level hierarchy;
- `Notice`: shared success, error, informational, and readiness messaging;
- `Toast`: canonical mobile-safe transient feedback;
- `wrapperClassName` support on UI-kit fields for grid composition;
- `ManageNavigation`: role-filtered modular navigation composed from the registry.

## Truth and security boundaries

- Hidden navigation is not authorization.
- Planned modules render a truthful boundary instead of fake forms or fixture success.
- R2 credentials are not collected by first-run browser setup.
- Browser code receives only masked integration metadata and short-lived upload requests.
- Mainnet remains disabled.
- No database record may imply paid, issued, minted, owned, positioned, settled, refunded, or anchored status without accepted evidence.

## Remaining UI-kit migration

These should be handled when the owning surface is next modified rather than creating a very large visual rewrite PR:

1. Replace local fields and cards in `/organizer/review`; eventually retire the transitional console after final Manage covers its accepted workflows.
2. Move platform-directory and pageant-detail heroes/cards to shared `PageHeader`, `Card`, `Badge`, and `EmptyState` primitives.
3. Audit homepage light-theme utility remnants and custom collectible promotional layout after the submission-critical management flows stabilize.
4. Add the real R2 Media Library, automatic asset picker, upload progress, attachment browser, and credential-rotation readiness state under B6/B17.
5. Let each milestone contribute its complete Manage module rather than editing the shared shell directly.
6. Add browser E2E at narrow phone, ordinary phone, tablet, desktop, landscape, 200% zoom, keyboard-only, and reduced-motion settings.

## Automated guard

`npm run test:ui` checks that:

- AppShell uses the shared module registry;
- Manage uses modular navigation and no longer defines local `Input`, `Panel`, or `TabButton` components;
- setup and account use the UI kit;
- browser setup does not collect R2 access credentials;
- legacy Toast imports resolve to the canonical Toast;
- major feature modules remain independently registered.

The test is included in `npm run check`.

## Human acceptance checklist

### Mobile hierarchy

- Open the landing page, a pageant, Vote, Tickets, Manage, and Account at 320–430 px width.
- Confirm the active pageant is understandable from the top bar and drawer.
- Confirm secondary pageant actions do not create a second scrolling navigation bar on mobile.
- Confirm bottom navigation never wraps and has no more than four destinations.
- Confirm Manage presents one module at a time and the organization/pageant context remains visible before the module.
- Confirm primary actions are full width where appropriate and are not hidden behind the bottom navigation.

### Accessibility and resilience

- Navigate all shell, drawer, account, setup, and Manage controls using only the keyboard.
- Verify visible focus, dialog focus trapping, Escape behavior, labels, and error announcements.
- Test at 200% browser zoom and narrow landscape.
- Test long pageant, organization, and contestant names.
- Test no organization, no pageant, no integration, denied role, revoked membership, API failure, and retry states.
- Test reduced motion.

### Role matrix

- public user;
- organizer/editor;
- organization owner/admin;
- viewer/auditor;
- site administrator;
- revoked member;
- cross-tenant account.

A module may be hidden or shown according to the role, but every protected request must still be enforced by the server.
