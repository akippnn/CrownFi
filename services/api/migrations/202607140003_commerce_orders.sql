-- CrownFi Milestone C2: durable orders, payment attempts, provider events,
-- and refunds. This migration does not submit Stellar transactions or seed
-- commerce records.

CREATE TABLE orders (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'awaiting_payment'
        CHECK (status IN (
            'created',
            'awaiting_payment',
            'paid',
            'fulfilling',
            'fulfilled',
            'failed',
            'expired',
            'refunded'
        )),
    environment TEXT NOT NULL
        CHECK (environment IN ('local', 'testnet', 'staging', 'production')),
    idempotency_key TEXT NOT NULL
        CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, idempotency_key),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE INDEX orders_organization_status_idx
    ON orders (organization_id, status, created_at DESC);
CREATE INDEX orders_buyer_status_idx
    ON orders (buyer_user_id, status, created_at DESC);

CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    unit_amount_minor BIGINT NOT NULL CHECK (unit_amount_minor > 0),
    total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, product_id),
    CHECK (total_amount_minor = unit_amount_minor * quantity),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE INDEX order_items_order_idx ON order_items (order_id, created_at);
CREATE INDEX order_items_product_idx ON order_items (product_id, created_at DESC);

CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (char_length(btrim(provider)) BETWEEN 1 AND 80),
    provider_reference TEXT,
    payer_account TEXT CHECK (payer_account IS NULL OR payer_account ~ '^G[A-Z2-7]{55}$'),
    expected_amount_minor BIGINT NOT NULL CHECK (expected_amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    environment TEXT NOT NULL
        CHECK (environment IN ('local', 'testnet', 'staging', 'production')),
    status TEXT NOT NULL DEFAULT 'awaiting_confirmation'
        CHECK (status IN ('created', 'awaiting_confirmation', 'confirmed', 'failed', 'expired')),
    failure_code TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE UNIQUE INDEX payment_attempts_provider_reference_unique
    ON payment_attempts (provider, provider_reference)
    WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX payment_attempts_one_active_per_order
    ON payment_attempts (order_id)
    WHERE status IN ('created', 'awaiting_confirmation');
CREATE INDEX payment_attempts_order_idx
    ON payment_attempts (order_id, created_at DESC);

CREATE TABLE payment_provider_events (
    id UUID PRIMARY KEY,
    payment_attempt_id UUID NOT NULL REFERENCES payment_attempts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (char_length(btrim(provider)) BETWEEN 1 AND 80),
    provider_event_id TEXT NOT NULL
        CHECK (char_length(btrim(provider_event_id)) BETWEEN 1 AND 200),
    payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    signature_verified BOOLEAN NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('confirmed', 'failed')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    payer_account TEXT CHECK (payer_account IS NULL OR payer_account ~ '^G[A-Z2-7]{55}$'),
    environment TEXT NOT NULL
        CHECK (environment IN ('local', 'testnet', 'staging', 'production')),
    processing_status TEXT NOT NULL
        CHECK (processing_status IN ('processed', 'rejected')),
    reconciliation_error TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_event_id),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE INDEX payment_provider_events_attempt_idx
    ON payment_provider_events (payment_attempt_id, created_at DESC);

CREATE TABLE refunds (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_attempt_id UUID REFERENCES payment_attempts(id) ON DELETE SET NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'submitted', 'confirmed', 'failed')),
    provider_reference TEXT,
    stellar_transaction_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE INDEX refunds_order_idx ON refunds (order_id, created_at DESC);
