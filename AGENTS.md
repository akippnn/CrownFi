# Deployment contract for automation and LLM agents

Production deployment for this repository has exactly one supported path. Read project-owned `.arcturus/project.json` and the sole release manifest `arcturus.release.json` first:

1. Run `scripts/arcturus-guard`, then the generic `scripts/arcturus-ci <full-commit>` driver.
2. In isolated job-local Buildah storage, build the API `test` and web `builder` validation targets before the corresponding `runtime` targets.
3. Push them and capture registry-provided `sha256` digests.
4. Render `arcturus.release.json`; `db-init` uses the exact same web digest.
5. Deploy only through `arcturusctl project deploy`; never use direct bearer-token curl.
6. Verify the active commit, exact images, component health, and the published router receipt for `stellar-project-web:3000`. Public verification expects the configured Cloudflare challenge.

Never do any of the following for production:

- Do not use `/deploy`, Terraform apply/destroy, `null_resource`, or generated Compose files.
- Do not deploy `latest` or any tag as the final image reference.
- Do not create a second deployment architecture or manually replace containers.
- Do not write nginx configuration directly. Routing comes from `spec.routing` in the active v2 release.
- Do not put secret values in Git, workflows, manifests, command arguments, or logs.
- Do not use `DEPLOY_WEBHOOK_SECRET`, `REGISTRY_PASSWORD`, embedded Git credentials, or shared/global Buildah pruning.
- Do not allow Compose/Watchtower and Quadlet to own the production service simultaneously.

Every component referenced by `spec.routing` must join `internal_routing`; the
route port is the container's listening port, not a host-published port. Wait for
the active manifest to be published and the generated portal vhost to appear.

`compose.yaml` and `infra/docker-compose.yml` are local/emergency compatibility files only. Terraform may manage long-lived infrastructure but never an application release. Existing database data is the external Podman volume `crownfi-platform_crownfi_postgres`; deployment and rollback must never delete it. Until a completed handoff receipt exists, the next v2 release transactionally stops containers labelled for the legacy Compose project `crownfi-platform`, starts the Quadlet release against the preserved volume, and restores only the containers that were running if activation fails. Retain the stopped legacy containers until a later verified v2 release.

Use `scripts/arcturus-lifecycle` for status/rollback/enable/disable/remove and manually dispatch the acceptance workflow for the expected-502 rollback probe. CI has no backup or reboot authority. If deployment fails, inspect the API response, route receipt, and systemd journals. Do not fall back to the legacy path.

The deployment contract is now replayable from `.arcturus/project.env` and
`.arcturus/project-spec.json`. After a newer blueprint is copied to
`.arcturus/blueprint/`, preview and apply it with `scripts/arcturus-update apply
--dry-run` and then `scripts/arcturus-update apply`. Supply the new digest-pinned
`ARCTURUS_BUNDLE` when the tracked lock is intentionally advanced.
