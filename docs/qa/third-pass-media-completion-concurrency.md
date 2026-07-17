# Third-pass finding: concurrent media completion

Issue: #109

## Finding

The media completion endpoint validates the R2 object before updating PostgreSQL. Two requests for the same pending asset can therefore validate concurrently. Without request serialization, both requests can attempt the lifecycle transition and both can emit `media.upload.complete` evidence. A success and a mismatch request can also race, creating a risk that the mismatch path removes bytes after another request accepted the asset.

## Remediation

CrownFi serializes `POST /admin/platform/media/:media_asset_id/complete` per asset with a PostgreSQL transaction-scoped advisory lock. The lock is acquired after central authorization and before the media handler runs. It works across API processes because PostgreSQL, rather than process memory, owns the lock.

The first request performs the normal object verification and transition. A concurrent retry runs only after the first request finishes, then follows the endpoint's existing idempotent `ready` response or its existing non-pending conflict response. The lock transaction contains no product writes and releases when the middleware commits or the connection is dropped.

## Regression evidence

`scripts/acceptance/media-completion-concurrency-smoke.sh` starts the persistent platform and MinIO adapter, uploads a 4 MiB object, submits eight completion requests concurrently, and requires:

- eight successful idempotent responses for a valid object;
- exactly one `media.upload.complete` audit record;
- one final `ready` media asset;
- retained Compose logs and database evidence on failure.

## Remaining lifecycle work

This closes the concrete completion race only. Issue #109 remains the umbrella for attachment replacement/removal, organizer library operations, pending-upload expiry, durable orphan cleanup, variants, immutable publication policy, and retirement/deletion behavior.
