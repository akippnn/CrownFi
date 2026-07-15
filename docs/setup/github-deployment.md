# GitHub-hosted CrownFi deployment

Production deploys from GitHub run only from `integration/platform-v1`. The
workflow uses GitHub-hosted build capacity, joins the tailnet as an ephemeral
tagged node, builds in isolated Buildah storage, publishes immutable image
digests, and delegates activation and verification to Arcturus.

## GitHub environment

Create a protected environment named `crownfi-production` and restrict it to
`integration/platform-v1`. Require an operator review when release latency
allows it. Store these values as environment secrets, not repository variables:

- `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`: a dedicated Tailscale OAuth
  client with only the `auth_keys` scope and permission to create
  `tag:crownfi-ci` nodes.
- `REGISTRY_USER` and `REGISTRY_TOKEN`: a dedicated registry automation
  identity limited to publishing the CrownFi API and web repositories.
- `ARCTURUS_DEPLOY_TOKEN`: a unique Arcturus token scoped only to
  `stellar-project`. Do not reuse the Gitea runner token.

The tailnet policy must allow `tag:crownfi-ci` to reach only the Arcturus
listener on `silent-tiger` at TCP port `9090`. Do not expose that listener to
the public Internet. The Tailscale action creates an ephemeral node and removes
its in-memory identity when the GitHub job ends.

Rotate every secret after suspected disclosure and remove unused OAuth clients
and registry identities. Never place a credential in Git, workflow inputs,
runner labels, image tags, command arguments, or build logs.

## Deployment contract

The GitHub workflow calls `scripts/arcturus-ci <full-commit>` and does not add a
second release mechanism. The same guard, validation targets, digest capture,
canonical `arcturus.release.json`, `arcturusctl project deploy`, transactional
legacy handoff, routing receipt, and post-deploy verification remain mandatory.
