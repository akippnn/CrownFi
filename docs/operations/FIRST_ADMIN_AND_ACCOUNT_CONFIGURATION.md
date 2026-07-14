# First-administrator and account configuration

CrownFi's browser setup and persistent account flow is introduced in draft PR #73.

## Local canonical profile

The canonical local Compose profile uses development-only fallback values so a fresh clone can reach `/setup` without first editing hidden allowlists.

- Local setup token: `local-first-admin-setup-token`
- Stellar network: Testnet
- Mainnet: disabled

These fallbacks are accepted only when `CROWNFI_API_MODE` starts with `local`. They are not suitable for a shared deployment.

## Required non-local configuration

Before staging or production-shaped deployment, configure independent random values for:

| Variable | Purpose |
|---|---|
| `CROWNFI_WEB_INTERNAL_TOKEN` | Private Next.js-to-Rust API boundary |
| `CROWNFI_SETUP_BOOTSTRAP_TOKEN` | One-time first-administrator authorization |
| `ACCOUNT_SESSION_SECRET` | HMAC signing for httpOnly CrownFi account sessions |
| `CROWNFI_CONFIG_PROTECTION_KEY` | 32-byte hex/base64 material for protecting saved integration configuration |
| `CROWNFI_ALLOW_MAINNET` | Deployment-level Mainnet gate; keep `false` for the current project |

The Rust API fails closed for its internal routes when a non-local deployment omits the internal token. It also generates an unusable setup token when a non-local deployment omits the configured setup token.

## Setup lifecycle

1. Deploy a clean database with Mainnet disabled.
2. Give the setup token to the authorized operator through a private channel.
3. The operator opens `/setup`, signs a Freighter message, and completes the first-admin form.
4. CrownFi creates the site owner and initial organization owner.
5. `/setup` becomes non-repeatable after successful completion.
6. Rotate or remove the deployment setup token after the setup record is verified.
7. Use `Manage → Site settings` for later non-secret settings.

## Integration configuration

Optional integration configuration entered during setup is protected by the Next.js server before it is persisted. The browser receives only provider name, validation state, timestamps, and a short masked suffix.

Current limitation: saving protected R2 configuration does not yet activate or reload the runtime R2 adapter. Runtime provider validation and activation require a later controlled configuration-loader slice. The UI and documentation must not describe an unvalidated record as an active integration.

## Accounts and linked wallets

- One CrownFi account may link multiple verified Stellar public addresses.
- A public address may belong to only one CrownFi account per Stellar network.
- Signing in with any linked wallet reopens the same account and role memberships.
- Wallet linking always uses the server-side account ID from the current signed session.
- CrownFi never requests or stores wallet seed phrases or private keys.

## Mainnet readiness

Mainnet is represented in the schema and network-aware wallet code, but remains unavailable through two separate controls:

1. deployment gate: `CROWNFI_ALLOW_MAINNET=false`;
2. persisted readiness gate: `site_settings.mainnet_enabled=false`.

The current Manage UI renders Mainnet disabled. A future production-readiness project must add explicit review, migration, operational, legal, contract-deployment, payment, recovery, and human-acceptance gates before exposing the setting.
