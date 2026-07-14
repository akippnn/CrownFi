# CrownFi Deploy

The full smart-contract deploy runbook now lives in **[contracts/DEPLOY_GUIDE.md](../../contracts/DEPLOY_GUIDE.md)**
(install → deploy → wire the web app → go live → troubleshooting → per-contract function reference).

- **Contracts (deploy to Stellar Testnet):** [contracts/DEPLOY_GUIDE.md](../../contracts/DEPLOY_GUIDE.md)
  or the one-command script [contracts/deploy.ps1](../../contracts/deploy.ps1).
- **Database (Supabase):** [Supabase setup](supabase.md)
- **Run & use the app (fan + admin flows):** [Demo user flow](../demo/user-flow.md)

## VPS application deployment

The only production VPS release contract is `arcturus.release.json` and
`POST /v1/deployments`. CI tests first, builds the API and web images with the
full commit SHA, resolves registry digests, renders the five-component release,
and requires JSON `status: succeeded`.

The next v2 release with no completed handoff receipt performs a transactional handoff from the legacy `crownfi-platform` Compose project: it quiesces the running legacy containers, preserves the external PostgreSQL volume, activates and verifies the Quadlet release, and restores the previously running legacy containers if activation fails. Stopped legacy containers are retained after success until a later cleanup.

## Deployment credential

`ARCTURUS_DEPLOY_TOKEN` is generated on the Arcturus VPS. It is not an API key obtained from Gitea, GitHub, Cloudflare, or Stellar.

Run this as the Arcturus host user:

```bash
umask 077
arcturusctl token create \
  --database "$HOME/.config/arcturus/tokens.json" \
  --service stellar-project \
  --token-id stellar-project-gitea \
  --output "$HOME/.config/arcturus/stellar-project-gitea.token"
cat "$HOME/.config/arcturus/stellar-project-gitea.token"
```

Copy the printed token into the protected Gitea repository secret named `ARCTURUS_DEPLOY_TOKEN`. Keep the token file on the VPS and never commit it.

For the existing `crownfi-platform` Compose installation, provision all first-release host prerequisites from the existing protected `infra/.env` in one command:

```bash
./scripts/arcturus-provision-host \
  --env-file infra/.env \
  --create-deploy-token
```

Run it as the rootless Arcturus host user from a trusted checkout on the VPS. It:

- verifies that `crownfi-platform_crownfi_postgres` exists instead of silently creating an empty database volume;
- verifies the external `internal_routing` network;
- creates the three Podman secrets referenced by `arcturus.release.json` using the existing Compose database password and admin-session secret;
- constructs `DATABASE_URL`/`DIRECT_URL` for the new `stellar-project-postgres` container hostname;
- checks that the host has a pull-only login for `git.u128.org`; and
- optionally creates the service-scoped deployment token and reports its protected file path.

Existing Podman secrets are preserved by default. Use `--replace-secrets` only when deliberately rotating them from the protected environment file.

The deployment workflow performs an authenticated preflight before building images. HTTP `401` means the token is missing or invalid; HTTP `403` means it is valid but not scoped to `stellar-project`. HTTP `502` with JSON `status: failed` means authentication succeeded but activation failed and Arcturus attempted rollback. Read the returned `error` and `rollback` fields and inspect the generated service journals on the VPS.

Compose files are for local or emergency compatibility only. Terraform does
not own application releases. Routing for `stellar-project.u128.org` is emitted
from `spec.routing` after the release is active; never edit nginx directly.

See the repository-root `AGENTS.md` before changing CI or deployment files.

## Blueprint updates

This repository tracks the declarative source for its five-component release in
`.arcturus/project-spec.json`. After the RC2 updater is adopted, a subsequent
blueprint migration is previewed and applied with:

```bash
./scripts/arcturus-update apply --dry-run -- --bundle 'registry.example.org/platform/arcturus@sha256:<new-digest>'
./scripts/arcturus-update apply -- --bundle 'registry.example.org/platform/arcturus@sha256:<new-digest>'
```

The updater preserves project-owned configuration and stages locally modified
generator files under `.arcturus/updates/` instead of overwriting them.
