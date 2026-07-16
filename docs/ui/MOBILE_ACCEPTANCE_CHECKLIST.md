# CrownFi mobile UI acceptance checklist

Use this checklist against the exact PR head and again against the deployed SHA.

## Viewports

- 320 × 568 — narrow phone
- 360 × 800 — ordinary Android phone
- 393 × 852 — ordinary iPhone
- 667 × 375 — narrow landscape
- 768 × 1024 — tablet
- desktop at 1280 px and 1440 px
- 200% browser zoom

## Shell

- [ ] Top bar remains one row without clipping the wallet action.
- [ ] Active pageant name truncates safely.
- [ ] The pageant selector works from the mobile drawer when multiple pageants are enabled.
- [ ] Pageant secondary actions appear in the drawer, not as a second scrolling mobile header.
- [ ] Bottom navigation contains no more than four primary destinations.
- [ ] Only the correct bottom destination appears active.
- [ ] Drawer closes after navigation, on backdrop tap, and through the close control.
- [ ] Page content is not hidden behind the fixed bottom navigation.

## Manage

- [ ] Organization and pageant context appears before module-specific work.
- [ ] One mobile workspace selector replaces the horizontal tab wall.
- [ ] Switching modules updates `?module=` and survives Back/Forward navigation.
- [ ] Organization changes select a pageant only within that organization.
- [ ] No-pageant states clearly explain which actions require pageant context.
- [ ] Voting, Ticketing, Markets, and Collectibles show truthful milestone boundaries rather than incomplete forms.
- [ ] People and Site modules appear only for the correct roles.
- [ ] Long organization, pageant, member, and wallet values wrap or truncate safely.

## Account

- [ ] Sign-in action is full width on phone.
- [ ] Link-wallet action remains visible and easy to reach.
- [ ] Wallet addresses truncate visually while the full address remains available as a title.
- [ ] Wallet and role badges wrap without overflow.
- [ ] Sign-out action is distinct and reachable.

## First-run setup

- [ ] Progress steps remain readable at narrow widths.
- [ ] Wallet verification precedes identity and organization submission.
- [ ] R2 access-key and secret-key fields are absent.
- [ ] The submit action remains above the bottom navigation and does not hide form content.
- [ ] Validation and server failures are announced visibly.
- [ ] Mainnet remains unavailable.

## Accessibility

- [ ] Keyboard navigation reaches every interactive element in order.
- [ ] Focus indicators are visible against every surface.
- [ ] Labels programmatically identify every field and selector.
- [ ] Toasts and errors are announced through status/alert semantics.
- [ ] Modal focus remains trapped and returns to the triggering element.
- [ ] Reduced-motion preference removes non-essential transition duration.
- [ ] No text or action requires horizontal page scrolling.

## Role and failure states

Test as:

- [ ] public user
- [ ] organizer/editor
- [ ] organization owner/admin
- [ ] viewer/auditor
- [ ] site administrator
- [ ] revoked member
- [ ] cross-tenant user

Test with:

- [ ] no organizations
- [ ] organization with no pageants
- [ ] R2 not configured
- [ ] API unavailable
- [ ] stale/archived pageant context
- [ ] long content
- [ ] wallet rejected/cancelled
