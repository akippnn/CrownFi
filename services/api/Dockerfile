FROM rust:1-bookworm AS builder
WORKDIR /app
COPY services/api/Cargo.toml services/api/Cargo.lock ./
COPY services/api/migrations ./migrations
COPY services/api/src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/crownfi-api /usr/local/bin/crownfi-api
EXPOSE 8080
CMD ["crownfi-api", "serve"]
