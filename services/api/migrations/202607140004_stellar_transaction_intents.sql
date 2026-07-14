-- CrownFi Milestone C3: persistent Stellar Testnet payment intents and
-- signed/submitted transaction records. This schema is append-only and does
-- not mark an order paid; C4 chain indexing owns confirmation.

CREATE TABLE transaction_intents (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_attempt_id UUID NOT NULL REFERENCES payment_attempts(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    operation_type TEXT NOT NULL CHECK (operation_type = 'payment'),
    network TEXT NOT NULL CHECK (network = 'testnet'),
    source_account TEXT NOT NULL CHECK (source_account ~ '^G[A-Z2-7]{55}$'),
    destination_account TEXT NOT NULL CHECK (destination_account ~ '^G[A-Z2-7]{55}$'),
    transaction_sequence BIGINT NOT NULL CHECK (transaction_sequence > 0),
    base_fee INTEGER NOT NULL CHECK (base_fee BETWEEN 100 AND 1000000),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    memo_text TEXT NOT NULL CHECK (octet_length(memo_text) BETWEEN 1 AND 28),
    idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    transaction_body_sha256 TEXT NOT NULL CHECK (transaction_body_sha256 ~ '^[0-9a-f]{64}$'),
    unsigned_envelope_sha256 TEXT NOT NULL CHECK (unsigned_envelope_sha256 ~ '^[0-9a-f]{64}$'),
    unsigned_envelope_xdr TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_signature'
        CHECK (status IN ('built', 'awaiting_signature', 'signed', 'submitted', 'confirmed', 'failed', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    signed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    failure_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, idempotency_key),
    CHECK (expires_at > created_at),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE UNIQUE INDEX transaction_intents_one_active_per_attempt
    ON transaction_intents (payment_attempt_id)
    WHERE status IN ('built', 'awaiting_signature', 'signed', 'submitted');
CREATE INDEX transaction_intents_order_idx
    ON transaction_intents (order_id, created_at DESC);
CREATE INDEX transaction_intents_status_expiry_idx
    ON transaction_intents (status, expires_at);

CREATE TABLE stellar_transactions (
    id UUID PRIMARY KEY,
    transaction_intent_id UUID NOT NULL UNIQUE REFERENCES transaction_intents(id) ON DELETE CASCADE,
    network TEXT NOT NULL CHECK (network = 'testnet'),
    envelope_sha256 TEXT NOT NULL UNIQUE CHECK (envelope_sha256 ~ '^[0-9a-f]{64}$'),
    signed_envelope_xdr TEXT NOT NULL,
    transaction_hash TEXT NOT NULL UNIQUE CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL DEFAULT 'signed'
        CHECK (status IN ('signed', 'submitted', 'confirmed', 'failed')),
    horizon_status_code INTEGER,
    horizon_response JSONB,
    failure_code TEXT,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stellar_transactions_status_idx
    ON stellar_transactions (status, created_at);
