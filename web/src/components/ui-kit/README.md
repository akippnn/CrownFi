# CrownFi UI Kit Foundation

This folder is the starting point for the upcoming UI/UX remake. It intentionally does **not** replace existing screens yet.

## Purpose

- Provide reusable primitives before the visual redesign starts.
- Keep page files from creating duplicate button, card, badge, input, and section styles.
- Keep styling close to the component so UI changes can be made in one place.
- Avoid conflicts with ticketing, documentation, and backend/platform branches.

## Current primitives

- `Button` / `ButtonLink`
- `Badge` / `StatusBadge`
- `Card` + card subcomponents
- `TextField` / `SelectField` / `TextareaField`
- `PageSection`, `SectionHeader`, `EmptyState`
- `Modal` / `ConfirmModal`

## Rules

1. Pages should compose UI kit primitives instead of creating one-off card/button styles.
2. Feature-specific components should live under `web/src/components/<feature>/` and use this UI kit where possible.
3. Do not put server security logic inside UI components.
4. Copy that affects security claims or product framing should remain centralized in feature copy modules.
5. This kit should stay small until the final UI/UX direction is approved.
