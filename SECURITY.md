# Security policy

CrownFi is currently a hackathon MVP. Treat Testnet assets, demo wallets, and demo data as disposable.
Do not use this repository for mainnet pageant voting, paid ticketing, or real customer data until the
items in `docs/SECURITY_AUDIT.md` marked **Open** are resolved and re-reviewed.

## Supported branch

Security checks are configured for `main` through GitHub Actions.

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
