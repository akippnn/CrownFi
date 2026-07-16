# First-administrator and account configuration

CrownFi uses a guarded first-run browser flow for identity and initial tenancy, while deployment integrations remain server-side.

## Local canonical profile

The canonical local Compose profile uses development-only fallback values so a fresh clone can reach `/setup` without first editing hidden allowlists.

- Local setup token: `local-first-admin-setup-token`
- Stellar network: Testnet
- Mainnet: disabled
- R2: optional and normally absent unless an explicit local integration profile is selected

These fallbacks are accepted only when `CROWNFI_API_MODE` starts with `local`. They are not suitable for a shared deployment.

## Required non-local configuration

Before staging or production-shaped deployment, configure independent random values for:

| Variable | Purpose |
|---|---|
| `CROWNFI_WEB_INTERNAL_TOKEN` | Private Next.js-to-Rust API boundary |
| `CROWNFI_SETUP_BOOTSTRAP_TOKEN` | One-time first-administrator authorization |
| `ACCOUNT_SESSION_SECRET` | HMAC signing for httpOnly CrownFi account sessions |
| `CROWNFI_CONFIG_PROTECTION_KEY` | Protection material for any persisted provider metadata that still requires sealing |
| `CROWNFI_ALLOW_MAINNET` | Deployment-level Mainnet gate; keep `false` for the current project |

The Rust API fails closed for internal routes when a non-local deployment omits the internal token. It also generates an unusable setup token when a non-local deployment omits the configured setup token.

## Setup lifecycle

1. Deploy a clean database with Mainnet disabled.
2. Provision required server-side integrations and secrets through the reviewed deployment/Arcturus path.
3. Give the setup token to the authorized operator through a private channel.
4. The operator opens `/setup`, signs a Freighter message, and completes the first-admin and initial-organization form.
5. CrownFi creates the site owner and initial organization owner.
6. `/setup` becomes non-repeatable after successful completion.
7. Rotate or remove the deployment setup token after the setup record is verified.
8. Use `Manage → Site administration` for later non-secret site settings and masked integration readiness.

## R2 and protected integrations

The browser setup form must **not** collect Cloudflare R2 access keys or secret keys.

R2 runtime configuration is supplied through the deployment/Arcturus secret boundary:

```env
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=crownfi-media
R2_PUBLIC_BASE_URL=https://media.example.com
```

The browser may receive only:

- provider name;
- masked identifier suffix where useful;
- validation/readiness state;
- timestamps;
- safe bucket/domain metadata;
- short-lived presigned upload requests.

After reviewed credential rotation and service reload/redeployment, new upload intents automatically use the active server-side R2 configuration. Existing media rows retain their object keys, hashes, attachments, and publication state. An invalid rotated configuration must fail closed as `r2_not_configured` or a specific validation failure; CrownFi must not silently store local files or claim a successful upload.

The final Media Library, asset picker, upload progress, orphan cleanup, and browser acceptance remain tracked under B6/B17. Masked integration metadata alone is not proof that a real browser upload has passed.

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

The Manage UI renders Mainnet disabled. A future production-readiness project must add explicit review, migration, operational, legal, contract-deployment, payment, recovery, and human-acceptance gates before exposing the setting.
