# CrownFi Design System

Design reference derived from the ui-ux-pro-max skill. Apply on the F2 codebase (do not regenerate).
Goal: a consistent, premium, non-sloppy UI across the fan and admin surfaces.

## Direction (LIGHT)
- Style: elegant light editorial with gold accent. WHITE is the primary background (matches the deck), gold is the accent. Soft warm off-white surfaces, restrained gold flourishes.
- Mood: elegant, luxury, editorial, premium. Not dark. The deck is white and gold.

## Color tokens (semantic; define once, never raw hex in components)
- background:   white with a subtle warm gradient (#FFFFFF to #FAF7EF), NOT #000
- foreground:   #23252F (ink); headings can use navy #1A1F35
- accent / CTA: gold fills #D4AF37 to #B8912F
- gold text:    #A97F16 (use for gold TEXT on white; contrast-safe. Bright gold is fills-only.)
- surface:      white cards; warm off-white #FAF7EF
- border:       #E7E2D3
- secondary:    #5F6172 (secondary text)
- destructive:  #DC2626
- success:      #10B981 (ink #0F6E56)
- ring (focus): #C9A227
Contrast: gold TEXT on white must use the deeper gold (#A97F16 / #B8912F); keep bright gold for fills only. Body text >=4.5:1.

## Typography
- Display / headings: Playfair Display (500-700).
- Body / UI: Inter (300-700).
- Load via next/font (already in use). Base 16px, line-height 1.5.

## Motion
- Easing: expo.out cubic-bezier(0.16, 1, 0.3, 1).
- Durations: 150-300ms for micro-interactions; modals slightly longer with a spring feel.
- Press: scale 0.97 -> 1.0 with visible feedback.
- Respect prefers-reduced-motion (disable/curtail).

## Component rules
- Buttons: gold gradient primary; ghost = border white/10. cursor-pointer on all clickable elements. Loading state disables + spinner. 44px min touch target.
- Cards / surfaces: frosted glass (bg white ~4-6%, border white ~10%, backdrop-blur). Keep clearly separated from background.
- Forms: visible <label> per field (no placeholder-only). Error near the field. Submit shows loading -> success or error, never silent.
- Nav: sticky top with body offset (no overlap). Bottom tab bar <=5 items. Predictable back behavior.
- Modals / drawers: scrim 40-60% black for legibility. Provide a visible cancel/close (escape route).
- Loading: skeletons or spinners for async, never a frozen or blank UI.

## Icons (fix this first)
- Rule: no emoji as structural icons. Replace all emoji icons with a single SVG family (Lucide recommended: `lucide-react`).
- Known emoji to replace in the app: bottom tab bar icons (Vote, Verify, Tickets, Collect, Me), the crown/lock glyphs, and the account chip.
- One icon family, consistent stroke width (1.5-2px), sizes as tokens (sm/md 24 / lg).

## Tailwind opacity note
- This Tailwind install supports opacity steps: 0,5,10,15,20,25,...,95,100 (multiples of 5, plus 15/35/45).
- It does NOT support /4, /6, /8, /12. Use bracket notation for those, e.g. `bg-white/[0.04]`, `border-white/[0.08]`.
- Codex already normalized these in F2; keep new UI on supported steps or bracket values.

## Pre-delivery checklist
- [ ] No emojis as icons (SVG only)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states, 150-300ms transitions
- [ ] Visible focus rings for keyboard nav
- [ ] Text contrast >=4.5:1 (both themes if applicable)
- [ ] prefers-reduced-motion respected
- [ ] Responsive at 375 / 768 / 1024 / 1440
- [ ] Form labels present; submit gives loading + result feedback
- [ ] No horizontal scroll on mobile

## Implementation notes for the other two asks (apply on F2)
Supabase (replace SQLite):
- prisma/schema.prisma datasource: provider = "postgresql".
- Add both URLs: DATABASE_URL (Supabase pooled, port 6543, `?pgbouncer=true`) and DIRECT_URL (direct, port 5432) so migrations work.
- Keep Codex's wallet-unique constraint. Run: `npx prisma migrate dev`.

Remove demo accounts:
- prisma/seed.ts: stop seeding demo fans (queen_bee, etc.). Seed only contestants / a round if needed.
- Identity comes from the connected Freighter wallet: on wallet sign-in, create-or-fetch a Fan by walletAddress. Remove the "sign in as" demo fan switcher from the session/account menu.
- Admin stays wallet-allowlist based (ADMIN_WALLETS), as Codex built it.
