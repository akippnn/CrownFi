FROM rust:1-bookworm AS chef
WORKDIR /app
RUN cargo install cargo-chef --locked --version 0.1.73

FROM chef AS planner
COPY services/api/Cargo.toml services/api/Cargo.lock ./
COPY services/api/migrations ./migrations
COPY services/api/src ./src
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json ./recipe.json
RUN cargo chef cook --release --locked --recipe-path recipe.json
COPY services/api/Cargo.toml services/api/Cargo.lock ./
COPY services/api/migrations ./migrations
COPY services/api/src ./src
RUN cargo build --release --locked

FROM builder AS test
RUN cargo test --release --locked

FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/crownfi-api /usr/local/bin/crownfi-api
EXPOSE 8080
CMD ["crownfi-api", "serve"]
