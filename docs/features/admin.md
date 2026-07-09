# Admin and organizer flows

Admin flows are for organizers, tabulators, auditors, and hackathon reviewers. They must be guarded server-side. Frontend-only admin mode is not a security boundary.

## Current MVP admin protections

The MVP includes wallet-signed admin sessions:

- `web/src/app/api/admin/challenge/route.ts`
- `web/src/app/api/admin/verify/route.ts`
- `web/src/app/api/admin/logout/route.ts`
- `web/src/lib/adminAuth.ts`

The server checks an admin wallet allowlist and uses a signed challenge to issue a short-lived session cookie.

## Admin actions

Admin-facing flows include:

- create contestants;
- create/open/close voting rounds;
- compute and anchor snapshots;
- manage organizer requests;
- redeem/check in tickets;
- review ticketing/verification state.

## Security posture

For the hackathon MVP, admin security should be practical:

- use a strong `ADMIN_SESSION_SECRET`;
- restrict `ADMIN_WALLETS` to known team/admin wallets;
- run over HTTPS on the VPS;
- do not expose Postgres or Redis publicly;
- treat testnet wallets and demo data as disposable;
- do not collect sensitive real user data.

## Refactor target

In the platform refactor, admin APIs should move into `services/api` with structured errors, auth middleware, and explicit audit logs. Admin actions should record actor, action type, target entity, timestamp, and result.
