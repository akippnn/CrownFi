# Pageant home widget architecture

## Purpose

Each pageant needs an organizer-controlled public home without creating a separate hardcoded landing page for every event. The editor must also show the real user experience rather than a second approximation that drifts from production.

## Single-renderer rule

`web/src/components/pageant/PageantHomeExperience.tsx` is the public renderer for a pageant home. It composes the existing CrownFi presentation components:

- `HeroSection`
- `ThreeDCarousel`
- `OrnatePortrait`
- `NFTCollectibleWithPedestal`
- `PromoSection`
- `AboutSection`
- `FooterSection`

The public pageant route renders this component directly.

The control-panel editor does **not** reproduce these sections. It opens the exact public route inside a desktop or mobile viewport and passes the current draft widget layout to that route. A UI change therefore affects the public page and editor preview together.

## Widget registry

`web/src/lib/pageantHome.ts` owns the allowed widget identifiers, defaults, editable fields, validation/normalization, order, and visibility state.

Initial widgets are based on the previous CrownFi landing page:

1. Pageant hero
2. Delegate showcase
3. Competition categories
4. Featured collectible
5. Ticket promotion
6. About the pageant
7. Pageant footer

The registry is deliberately finite. Organizers can arrange and configure supported components, but cannot inject arbitrary HTML, scripts, React component names, or unvalidated classes.

## Editor behavior

The Pageant Home editor provides:

- widget selection;
- show/hide controls;
- ordering controls;
- optional text overrides;
- desktop and mobile route previews;
- reset to canonical defaults;
- an explicit public-page link.

The preview uses the actual responsive shell. It therefore includes the selected pageant navigation, floating mobile controls, and floating mobile bottom bar instead of mocking them separately.

## Current persistence boundary

This PR establishes the UI contract and keeps a pageant-scoped browser draft so the editor and exact-route preview can be exercised safely. It does not claim that the draft is published to all users.

Durable publishing still requires a protected PostgreSQL/API write model with:

- organization and pageant ownership checks;
- server-side widget-schema validation;
- draft and published revisions;
- audit records;
- optimistic concurrency or revision checks;
- public reads of the published revision only;
- rollback to an earlier published revision.

That write path must use CrownFi's centralized authorization boundary rather than introducing a browser-only or unprotected shortcut.

## Navigation relationship

The selected pageant is application context, not a second global navigation system.

- Desktop has one centered navigation bar. Its pageant actions change with the selected pageant.
- The pageant chooser makes leaving the current context explicit through **Explore all pageants**.
- Mobile has no fixed top bar. Menu and account controls float independently, while the pageant logo remains in document flow.
- Mobile primary navigation is the floating bottom bar.
- The full-screen control panel exits back to the selected pageant or the pageant directory.

## Acceptance requirements

Before merge, verify:

- the editor preview and public route render the same widget component tree;
- widget order and visibility update in both desktop and mobile preview modes;
- pageant switching changes navbar actions and active-state ownership;
- `/platform` visually leaves pageant context;
- Manage never nests inside the public navigation shell;
- no editor-only copy claims that a browser draft is publicly published;
- keyboard, focus, reduced-motion, overflow, and 200% zoom behavior remain usable.
