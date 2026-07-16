# CrownFi UI kit

Use this directory for shared visual and interaction primitives. Domain components may compose these primitives, but pages should not recreate local buttons, fields, cards, badges, notices, modals, or page headers without a documented reason.

## Foundation

- `Button` / `ButtonLink` — primary actions and links
- `Card` — grouped content surfaces
- `Field` — labelled text, select, and textarea controls
- `Badge` — compact states and metadata
- `Notice` — persistent success, error, warning, and readiness messages
- `Toast` — transient feedback
- `Modal` / `ConfirmModal` — focused tasks and irreversible-action review
- `PageHeader` / `SectionHeader` / `EmptyState` — page and content hierarchy

## Domain presentation

The kit also contains CrownFi-specific reusable presentation:

- `OrnatePortrait`
- `Collectible`
- `ThreeDCarousel`
- `HeroSection`
- `AboutSection`
- `PromoSection`
- `FooterSection`

These are reusable within CrownFi but must not own authorization, payment, voting, settlement, or persistence rules.

## Rules

1. Business rules and authorization stay outside UI components.
2. Hidden or disabled controls never replace server-side authorization.
3. Mobile layouts preserve a clear page → context → task hierarchy.
4. Controls require visible focus, labels, disabled states, and adequate touch targets.
5. Use `Notice` for persistent state and `Toast` only for transient acknowledgement.
6. Use `PageHeader` once per application page and `SectionHeader` for content sections.
7. Feature milestones register navigation through `crownfiModules.ts`; they do not hardcode links into the shared shell.
8. Planned capabilities show truthful availability rather than fixture success.
9. Public/product media selectors use media asset IDs and the server-side R2 workflow; browser code never receives R2 credentials.
10. Preserve the dark-only submission contract until a separate reviewed light-theme release is approved.

Feature-specific components should remain under `web/src/components/<feature>/` and compose these primitives rather than forcing every domain into one generic component.
