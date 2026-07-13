# Milestone B progress

Milestone B turns CrownFi into a persistent multi-pageant platform. It supports the original product scope—organizers, contestants, fans, auditors, voting, tickets, and collectibles—without hardcoding one event into the application.

## Completed platform foundation

- SQLx-owned PostgreSQL schema and migration validation.
- Persistent users, organizations, memberships, pageants, categories, contestants, pageant participation, and configurable contestant sections.
- Organization-scoped editor authorization and transactional audit logging.
- Restart-safe persistence smoke testing.
- Cloudflare R2-compatible media model, upload authorization, integrity verification, visibility, and contestant media relationships.
- Explicit demo seed command that is repeatable, opt-in, and forbidden in staging/production.

## Still required before Milestone B closes

- Organizer-facing web forms and generated/API client integration.
- Production-grade authenticated sessions replacing the transitional demo admin token and actor header.
- Authoritative server-side image decoding and dimensions.
- Media variants/thumbnails and orphan lifecycle cleanup.
- OpenAPI publication and generated TypeScript client.
- Redis-backed rate limiting and shared runtime controls.
- Human testing of cross-organization isolation, pageant creation, contestant management, section ordering, and real R2 upload through the browser.

## Human testing

Fastest validation path:

1. Run the explicit demo seed against a fresh local PostgreSQL database.
2. Start the Rust API and confirm the demo pageant, three contestants, and sections appear through platform read endpoints.
3. Create a second organization through the API and prove it cannot mutate the demo organization.
4. Configure an S3-compatible local test store or Cloudflare R2 test bucket, upload one portrait, complete it, attach it, and restart the API.
5. Confirm the portrait relationship and all database records survive restart.
6. Attempt a same-size upload with different bytes and confirm completion is rejected.

Tools:

- Docker Compose for PostgreSQL, Redis, API, and optional MinIO test storage.
- `curl` or Bruno/Postman for API calls.
- `psql` for direct persistence and audit verification.
- Cloudflare R2 dashboard only for checking the resulting object; credentials remain server-side.
- Browser testing becomes mandatory once organizer forms land.

Current status: the backend platform and media foundation are implemented in review branches, but Milestone B is not complete until the web organizer flow, final authentication boundary, OpenAPI client, and human acceptance pass.