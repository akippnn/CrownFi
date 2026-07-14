-- CrownFi Milestone C5: durable one-of-one collectible fulfillment, retryable
-- jobs, mint evidence, and chain-derived ownership projections.

CREATE TABLE fulfillment_jobs (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind = 'collectible_mint'),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'awaiting_chain', 'fulfilled', 'failed', 'dead_letter')),
    idempotency_key TEXT NOT NULL
        CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, idempotency_key),
    CHECK ((locked_at IS NULL) = (locked_by IS NULL))
);

CREATE INDEX fulfillment_jobs_available_idx
    ON fulfillment_jobs (status, available_at, created_at)
    WHERE status IN ('queued', 'failed');
CREATE INDEX fulfillment_jobs_order_idx
    ON fulfillment_jobs (order_id, created_at);

CREATE TABLE collectible_mints (
    id UUID PRIMARY KEY,
    fulfillment_job_id UUID NOT NULL UNIQUE REFERENCES fulfillment_jobs(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
    collectible_edition_id UUID NOT NULL REFERENCES collectible_editions(id) ON DELETE RESTRICT,
    contract_id TEXT NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
    recipient_account TEXT NOT NULL CHECK (recipient_account ~ '^G[A-Z2-7]{55}$'),
    metadata_sha256 TEXT NOT NULL CHECK (metadata_sha256 ~ '^[0-9a-f]{64}$'),
    mint_reference_sha256 TEXT NOT NULL UNIQUE CHECK (mint_reference_sha256 ~ '^[0-9a-f]{64}$'),
    token_id TEXT,
    transaction_hash TEXT CHECK (transaction_hash IS NULL OR transaction_hash ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'submitted', 'confirmed', 'failed')),
    submission_response JSONB,
    failure_code TEXT,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (status = 'queued' AND token_id IS NULL AND transaction_hash IS NULL)
        OR (status IN ('submitted', 'confirmed') AND token_id IS NOT NULL AND transaction_hash IS NOT NULL)
        OR (status = 'failed')
    )
);

CREATE INDEX collectible_mints_status_idx
    ON collectible_mints (status, created_at);

CREATE TABLE collectible_mint_evidence (
    id UUID PRIMARY KEY,
    collectible_mint_id UUID NOT NULL REFERENCES collectible_mints(id) ON DELETE CASCADE,
    network TEXT NOT NULL CHECK (network = 'testnet'),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
    contract_id TEXT NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
    token_id TEXT NOT NULL CHECK (char_length(btrim(token_id)) BETWEEN 1 AND 160),
    owner_account TEXT NOT NULL CHECK (owner_account ~ '^G[A-Z2-7]{55}$'),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    event_index INTEGER NOT NULL CHECK (event_index >= 0),
    successful BOOLEAN NOT NULL,
    evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
    raw_event JSONB NOT NULL,
    processing_status TEXT NOT NULL CHECK (processing_status IN ('accepted', 'rejected')),
    reconciliation_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, transaction_hash, event_index),
    CHECK (
        (processing_status = 'accepted' AND reconciliation_error IS NULL)
        OR (processing_status = 'rejected' AND reconciliation_error IS NOT NULL)
    )
);

CREATE UNIQUE INDEX collectible_mint_one_accepted_evidence
    ON collectible_mint_evidence (collectible_mint_id)
    WHERE processing_status = 'accepted';
CREATE INDEX collectible_mint_evidence_mint_idx
    ON collectible_mint_evidence (collectible_mint_id, created_at DESC);

CREATE TABLE ownership_projections (
    id UUID PRIMARY KEY,
    network TEXT NOT NULL CHECK (network = 'testnet'),
    contract_id TEXT NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
    token_id TEXT NOT NULL CHECK (char_length(btrim(token_id)) BETWEEN 1 AND 160),
    owner_account TEXT NOT NULL CHECK (owner_account ~ '^G[A-Z2-7]{55}$'),
    collectible_mint_id UUID NOT NULL UNIQUE REFERENCES collectible_mints(id) ON DELETE RESTRICT,
    source_transaction_hash TEXT NOT NULL CHECK (source_transaction_hash ~ '^[0-9a-f]{64}$'),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    event_index INTEGER NOT NULL CHECK (event_index >= 0),
    raw_event JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, contract_id, token_id)
);

CREATE INDEX ownership_projections_owner_idx
    ON ownership_projections (network, owner_account, updated_at DESC);
