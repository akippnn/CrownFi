# Security policy

CrownFi is a hackathon/testnet MVP. Treat testnet assets, demo wallets, and demo data as disposable. Do not use this repository for real pageant voting, paid ticketing, production wallet custody, or real customer data until the items in `docs/security/security-audit.md` marked **Open** are resolved and re-reviewed.

The goal of the current security posture is practical MVP hardening: enough to run a credible demo and a cautious VPS-hosted testnet deployment, while being clear that this is not production approval.

## Supported branch

Security checks are configured for `main` through GitHub Actions.

## Current MVP safeguards

- Server-side wallet-signed admin sessions for sensitive admin routes.
- Short-lived transaction intents for live Stellar/Soroban confirmation flows.
- Signed XDR source/body-hash validation before recording ticket, collectible, or audit-anchor outcomes.
- Basic rate limiting for high-risk demo endpoints.
- CI checks for npm audit, TypeScript, Merkle tests, Rust format/tests/audit, secret smoke tests, and best-effort CodeQL.
- Clear testnet/demo framing in docs and README.
- Docker Compose path for local and VPS-style deployment experiments.

These controls are intended to reduce obvious hackathon/VPS risks. They are not a substitute for a full production security review.

## VPS deployment baseline

For a public VPS-hosted demo, use at least this baseline:

1. Run behind HTTPS using a reverse proxy such as Caddy, Traefik, or Nginx.
2. Keep Postgres and Redis private to the Docker network or VPS firewall; do not expose database ports publicly.
3. Configure all secrets through environment variables or Docker secrets, never committed files.
4. Use strong values for `ADMIN_SESSION_SECRET`, database passwords, and Stellar platform secret keys.
5. Keep `STELLAR_MODE=mock` unless the relevant testnet contracts are deployed and verified.
6. Use a dedicated testnet platform wallet, not a personal or mainnet wallet.
7. Restrict admin wallet allowlists to known team wallets.
8. Keep backups of the database if the demo will be used by real testers.
9. Do not collect sensitive real user data during the hackathon demo.

## Required secrets for production-like deploys

Keep these in the hosting provider or GitHub Actions secrets. Never commit them:

- `DATABASE_URL`
- `DIRECT_URL`
- `ADMIN_SESSION_SECRET`
- `STELLAR_PLATFORM_SECRET`
- `PRIVY_APP_SECRET`
- `UPSTASH_REDIS_REST_TOKEN`

## Reporting

For the hackathon team, report issues privately to the project lead/developers first. Include:

1. affected route/contract/file,
2. reproduction steps,
3. expected impact,
4. whether funds, votes, or private organizer data could be affected.
