# Cloudflare R2 media storage

CrownFi stores public pageant and product images in Cloudflare R2. PostgreSQL stores the object identity, integrity hash, dimensions, visibility, ownership, and lifecycle state; R2 stores the bytes.

## Scope

The shared media system is intended for:

- contestant portraits, banners, and galleries;
- pageant and organization branding;
- sponsor artwork;
- contestant-section images;
- collectible artwork and storefront thumbnails;
- generated thumbnails and other image variants.

KYC identity documents, selfies, proof-of-address images, and other regulated identity evidence must **not** use this general media bucket. Those should remain with the selected KYC provider. CrownFi stores only provider references, policy decisions, and the minimum audit metadata required by the product.

## Authority boundary

- R2 is authoritative for uploaded image bytes.
- PostgreSQL is authoritative for whether an object is pending, ready, failed, private, unlisted, or public.
- The R2 object key—not a full public URL—is the stable image identity.
- A published collectible image must use a versioned/content-addressed key and a stored SHA-256 hash. Replacing bytes at the same published key is prohibited by policy.

## Upload lifecycle

1. An organization editor asks the Rust API for an upload intent.
2. The API validates the image type, declared size, SHA-256 hash, organization membership, and filename.
3. The API inserts a `media_assets` row in `pending` state.
4. The API returns a short-lived presigned R2 `PUT` request and its required headers.
5. The client uploads directly to R2; application servers do not proxy normal image bytes.
6. The client calls the completion endpoint.
7. The API performs `HeadObject` to compare length, content type, and metadata, then streams the stored object through the server to calculate the actual SHA-256 before marking it ready.
8. Matching objects become `ready`; mismatches become `failed` and are removed when possible.
9. A ready asset can be attached to a contestant as a portrait, banner, gallery item, or section image.

The completion-time download is intentionally bounded by `R2_MAX_IMAGE_BYTES`. It avoids trusting a client-supplied hash or metadata value as proof of the actual uploaded bytes. A later worker can move this verification out of the request path while preserving the same lifecycle states.

## Supported input formats

The first implementation accepts:

- JPEG;
- PNG;
- WebP;
- AVIF;
- GIF.

SVG is intentionally rejected because safely serving arbitrary uploaded SVG requires a separate sanitization and Content Security Policy review.

## Environment contract

```env
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=crownfi-media
R2_PUBLIC_BASE_URL=https://media.example.com
R2_UPLOAD_TTL_SECONDS=300
R2_MAX_IMAGE_BYTES=15728640
```

Use a restricted R2 API token for the selected bucket. Do not expose R2 credentials to Next.js client code or browser bundles.

## Local and CI testing

The ordinary clean-clone path may leave R2 variables blank. Media write endpoints must then return a visible `r2_not_configured` service-unavailable error rather than silently storing local files or pretending the upload succeeded.

An explicit media integration test uses MinIO as an S3-compatible test adapter. This tests request signing, direct upload, byte-level SHA-256 verification, completion, database metadata, cross-organization denial, private-media denial, restart persistence, and contestant attachment without claiming that MinIO is the production storage provider.

## API surface

```text
POST /admin/platform/organizations/:organization_id/media/upload-intents
POST /admin/platform/media/:media_asset_id/complete
GET  /platform/media/:media_asset_id
POST /admin/platform/pageant-contestants/:pageant_contestant_id/media
GET  /platform/pageant-contestants/:pageant_contestant_id/media
```

The current admin token and `x-crownfi-user-id` header remain transitional. Final authorization must come from authenticated user sessions and organization-scoped RBAC.

## Remaining work

- image decoding and authoritative dimensions rather than accepting client-reported dimensions;
- malware/polyglot checks;
- asynchronous thumbnail/variant generation;
- lifecycle deletion and orphan cleanup;
- CDN/custom-domain configuration;
- immutable collectible publication policy enforcement;
- organizer-facing upload and media-selection UI;
- migration of existing local image assets into R2.
