# CrownFi authorization model

CrownFi authorizes protected requests in the Rust API. Hiding navigation or controls in Next.js is not an authorization boundary.

## Principal and transport binding

Protected browser-mediated requests require both the server-only web-to-API credential and the authenticated CrownFi account ID in `x-crownfi-user-id`. Administrative API requests require the administrative transport credential plus an actor ID. Restricted payout-worker callbacks use their dedicated worker credential.

Request bodies and resource paths that contain an actor are checked against the authenticated actor header. Missing or conflicting actor identity fails closed.

## Roles

Site roles:

- `owner` and `admin`: reviewed platform administration;
- `operator`: narrow operational and recovery access;
- `auditor`: read-only evidence and reconciliation access.

Organization roles:

- `owner` and `admin`: membership and organization management;
- `editor`: pageant, media, catalogue, order, intent, and fulfillment creation;
- `operator`: narrow operational actions;
- `auditor` and `viewer`: read-only evidence and operational views.

Roles never grant access outside their organization. Account owners may read only the explicitly supported resources they own.

## Decision rules

- Unknown capabilities and unknown `/internal` or `/admin` routes are denied.
- Missing, suspended, removed, or otherwise inactive principals and memberships are denied on each protected request.
- Correctly scoped but insufficient roles receive `403 Forbidden`.
- Cross-tenant resource access may return `404 Not Found` to avoid disclosing another tenant's resource existence.
- Protected business projections continue to rely on their domain and chain-evidence rules after authorization succeeds.

Authorization decisions are recorded in the append-only `authorization_decisions` evidence table with actor, capability, organization/resource scope, result, reason, method, path, and time.

## Current migration boundary

The durable internal and administrative platform routes use the centralized capability middleware. Durable Prediction Market creation, review submission, governance, policy, staking, and stake-intent access now use named capabilities and tenant/resource scopes. The existing in-memory voting intake route remains explicitly classified as legacy until its durable replacement adopts the same boundary.

## Acceptance

The automated matrix covers owner/editor success, same-tenant viewer denial, cross-tenant concealment, revoked-membership denial, actor-spoof rejection, missing-actor rejection, durable decision evidence, and denial after restart.

Milestone B remains open until browser and direct-request tests cover public user, organizer, organization owner/admin, site administrator, operator, auditor/viewer, revoked user, and cross-tenant user against one exact deployed revision.
