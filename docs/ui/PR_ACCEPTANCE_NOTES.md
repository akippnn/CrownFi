# UI modular-shell PR acceptance notes

Implementation branch: `ui/modular-mobile-shell-v1`

## Automated gate

From `web/`:

```bash
npm ci
npm run check
npm run build
```

The UI adoption test is included in `npm run check`.

## Focused smoke path

1. Open `/platform` on desktop and phone.
2. Open a pageant and use the desktop context navigation.
3. At phone width, confirm pageant actions move into the drawer.
4. Sign in and open `/account`; link-wallet and sign-out controls must remain reachable.
5. Open `/manage`; switch organization, pageant, and module.
6. Use browser Back/Forward after switching `?module=` values.
7. Confirm People and Site visibility matches role.
8. Confirm Media, Voting, Ticketing, Markets, and Collectibles show accurate milestone boundaries.
9. On an empty database, open `/setup`; verify R2 credentials are not requested and complete first-administrator setup.
10. Repeat the exact checklist in `MOBILE_ACCEPTANCE_CHECKLIST.md` against the deployed SHA.

## Deliberately unchanged

- voting business logic;
- ticket purchase/issuance business logic;
- prediction-market lifecycle and settlement;
- collectible minting and ownership;
- Rust API authorization;
- R2 upload implementation and secret provisioning;
- Stellar transaction truth boundaries.

Those remain owned by their respective milestones and existing concerns.
