# GitHub-hosted CrownFi deployment

Production releases from GitHub run only from `main`. The workflow uses
GitHub-hosted build capacity, joins the tailnet as an ephemeral tagged node,
builds in isolated Buildah storage, publishes immutable image digests, and
delegates activation and verification to Arcturus.

## GitHub environment

Create a protected environment named `crownfi-production` and restrict it to
`main`. Require an operator review when release latency allows it.

Store these values as **environment secrets**:

- `TS_AUTHKEY`: an ephemeral, reusable, pre-signed Tailscale auth key carrying
  `tag:crownfi-ci`. This is required because the tailnet uses Tailnet Lock. The
  workflow supplies a state directory so the runner can store Tailnet Key
  Authority data while it is connected.
- `REGISTRY_USER` and `REGISTRY_TOKEN`: a dedicated registry automation
  identity limited to publishing the CrownFi API and web repositories.
- `ARCTURUS_DEPLOY_TOKEN`: a unique Arcturus token scoped only to
  `stellar-project`. Do not reuse the registry or Gitea runner token.

`TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` are not used by the locked-tailnet
workflow. Keep or remove them according to the repository's credential-retention
policy, but do not substitute them for `TS_AUTHKEY` while Tailnet Lock is
enabled.

The tailnet policy must allow `tag:crownfi-ci` to reach only the Arcturus
listener on `silent-tiger` at TCP port `9090`. Do not expose that listener to
the public Internet. The Tailscale action creates an ephemeral node and removes
its in-memory identity when the GitHub job ends.

Rotate `TS_AUTHKEY` before its configured expiry. Generate a replacement as an
ephemeral reusable key with `tag:crownfi-ci`, pre-sign it from a trusted Tailnet
Lock signing node, replace the GitHub environment secret, then revoke the old
key after a deployment succeeds with the replacement.

Store these as **environment variables**, not secrets:

- `CROWNFI_R2_ENABLED`: `false` until the bucket and host secrets are ready,
  then `true`.
- `R2_ENDPOINT`: the account-scoped R2 S3 endpoint.
- `R2_BUCKET`: the CrownFi bucket name.
- `R2_PUBLIC_BASE_URL`: the public custom-domain or R2 development URL used to
  read published objects.
- `R2_UPLOAD_TTL_SECONDS`: optional, defaults to `300`.
- `R2_MAX_IMAGE_BYTES`: optional, defaults to `15728640`.

Only the allowlisted R2 variables above are materialized into the reviewed
release manifest. Runtime modes remain tracked in `arcturus.release.json`;
changing an unrelated GitHub variable cannot rewrite the deployment.

## Arcturus runtime secrets

Application runtime secrets are host-provisioned rootless Podman secrets. They
are not GitHub environment secrets and their values do not belong in the
release manifest.

Provision them as the same Unix account that runs Arcturus and rootless Podman.
For a new value:

```bash
sudo -iu <arcturus-user>
umask 077
printf '%s' '<value>' | podman secret create <secret-name> -
```

Verify names without displaying values:

```bash
podman secret ls
```

The existing release references:

```text
stellar-postgres-password-20260713
stellar-database-url-20260712
stellar-web-internal-20260715
stellar-setup-bootstrap-20260715
stellar-payout-worker-20260715
stellar-admin-session-20260712
stellar-account-session-20260715
stellar-config-protection-20260715
```

When `CROWNFI_R2_ENABLED=true`, the production materialization step additionally
references:

```text
stellar-r2-access-key-id-20260716
stellar-r2-secret-access-key-20260716
```

Arcturus preflight verifies that every referenced Podman secret exists before
an expensive image build. It never returns secret values.

## Cloudflare R2 runtime binding

The R2 endpoint, bucket and public base URL come from protected GitHub
environment variables and are resolved into the release manifest before
Arcturus preflight. The S3 access-key ID and secret access key stay only in the
Arcturus host's Podman secret store.

Use a bucket-scoped R2 S3 API token. Do not use a Cloudflare Global API Key.

## Deployment contract

The GitHub workflow calls `scripts/arcturus-ci <full-commit>` and does not add a
second release mechanism. The same guard, validation targets, digest capture,
canonical resolved release manifest, deployment transaction, routing receipt,
and post-deploy verification remain mandatory.

After a normal deployment succeeds, manually dispatch the same workflow from
`main` with `acceptance` enabled. This runs the expected-502 rollback probe and
verifies that Arcturus restores the same active revision, image digests, health,
and route receipt.
