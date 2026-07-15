# Explicit demo seed

CrownFi demo data is created only through an explicit Rust API command. Normal migrations and server startup leave platform tables empty.

## Command

```bash
CROWNFI_ALLOW_DEMO_SEED=true \
DATABASE_URL=postgresql://... \
CROWNFI_API_MODE=local \
cargo run --manifest-path services/api/Cargo.toml -- seed demo
```

The command applies SQLx migrations first, then creates or updates a deterministic demo organization, owner membership, pageant, fan-choice category, three contestants, category memberships, configurable contestant sections, and one audit record.

Running the command repeatedly must not create duplicate demo records.

## Safety boundary

- `CROWNFI_ALLOW_DEMO_SEED=true` is mandatory.
- The command is rejected when `CROWNFI_API_MODE` is `staging` or `production`.
- Normal `serve` and `migrate` commands never seed data.
- Demo identifiers are deterministic so acceptance tests can verify idempotency.
- Demo records are not a substitute for organizer-created platform data.

This profile supports local development and explicit Testnet review environments. Shared staging and production environments must be provisioned through authenticated platform workflows instead.