-- CrownFi Milestone C6: deterministic collectible-sale payout rules,
-- expected transfers, restricted-worker submissions, and indexed evidence.

CREATE TABLE payout_rules (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    candidate_account TEXT NOT NULL CHECK (candidate_account ~ '^G[A-Z2-7]{55}$'),
    organizer_account TEXT NOT NULL CHECK (organizer_account ~ '^G[A-Z2-7]{55}$'),
    platform_account TEXT NOT NULL CHECK (platform_account ~ '^G[A-Z2-7]{55}$'),
    candidate_bps INTEGER NOT NULL CHECK (candidate_bps BETWEEN 0 AND 10000),
    organizer_bps INTEGER NOT NULL CHECK (organizer_bps BETWEEN 0 AND 10000),
    platform_bps INTEGER NOT NULL CHECK (platform_bps BETWEEN 0 AND 10000),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (candidate_bps + organizer_bps + platform_bps = 10000),
    CHECK (
        candidate_account <> organizer_account
        AND candidate_account <> platform_account
        AND organizer_account <> platform_account
    )
);

CREATE UNIQUE INDEX payout_rules_one_active_per_product
    ON payout_rules (product_id)
    WHERE status = 'active';
CREATE INDEX payout_rules_org_product_idx
    ON payout_rules (organization_id, product_id, created_at DESC);

CREATE TABLE payout_batches (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    payout_rule_id UUID NOT NULL REFERENCES payout_rules(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'prepared'
        CHECK (status IN ('prepared', 'submitted', 'partial', 'confirmed', 'failed')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    idempotency_key TEXT NOT NULL
        CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    expected_transfer_count INTEGER NOT NULL DEFAULT 3 CHECK (expected_transfer_count = 3),
    confirmed_transfer_count INTEGER NOT NULL DEFAULT 0
        CHECK (confirmed_transfer_count BETWEEN 0 AND 3),
    submitted_transaction_hash TEXT
        CHECK (submitted_transaction_hash IS NULL OR submitted_transaction_hash ~ '^[0-9a-f]{64}$'),
    submission_response JSONB,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    failure_code TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, idempotency_key),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    ),
    CHECK (
        (status = 'prepared' AND submitted_transaction_hash IS NULL AND submitted_at IS NULL)
        OR
        (status IN ('submitted', 'partial', 'confirmed')
            AND submitted_transaction_hash IS NOT NULL
            AND submitted_at IS NOT NULL)
        OR
        status = 'failed'
    )
);

CREATE INDEX payout_batches_status_idx
    ON payout_batches (status, created_at);

CREATE TABLE payout_transfers (
    id UUID PRIMARY KEY,
    payout_batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('candidate', 'organizer', 'platform')),
    recipient_account TEXT NOT NULL CHECK (recipient_account ~ '^G[A-Z2-7]{55}$'),
    expected_amount_minor BIGINT NOT NULL CHECK (expected_amount_minor >= 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'submitted', 'confirmed', 'rejected', 'failed')),
    operation_index INTEGER CHECK (operation_index IS NULL OR operation_index >= 0),
    transaction_hash TEXT CHECK (transaction_hash IS NULL OR transaction_hash ~ '^[0-9a-f]{64}$'),
    actual_amount_minor BIGINT CHECK (actual_amount_minor IS NULL OR actual_amount_minor >= 0),
    ledger_sequence BIGINT CHECK (ledger_sequence IS NULL OR ledger_sequence > 0),
    failure_code TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (payout_batch_id, role),
    CHECK (
        (status IN ('pending', 'submitted') AND confirmed_at IS NULL)
        OR (status = 'confirmed' AND confirmed_at IS NOT NULL)
        OR status IN ('rejected', 'failed')
    )
);

CREATE INDEX payout_transfers_batch_status_idx
    ON payout_transfers (payout_batch_id, status);

CREATE TABLE payout_transfer_evidence (
    id UUID PRIMARY KEY,
    payout_transfer_id UUID NOT NULL REFERENCES payout_transfers(id) ON DELETE CASCADE,
    network TEXT NOT NULL CHECK (network = 'testnet'),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
    operation_index INTEGER NOT NULL CHECK (operation_index >= 0),
    source_account TEXT NOT NULL CHECK (source_account ~ '^G[A-Z2-7]{55}$'),
    recipient_account TEXT NOT NULL CHECK (recipient_account ~ '^G[A-Z2-7]{55}$'),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    successful BOOLEAN NOT NULL,
    evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
    raw_operation JSONB NOT NULL,
    processing_status TEXT NOT NULL CHECK (processing_status IN ('accepted', 'rejected')),
    reconciliation_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, transaction_hash, operation_index),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    ),
    CHECK (
        (processing_status = 'accepted' AND reconciliation_error IS NULL)
        OR
        (processing_status = 'rejected' AND reconciliation_error IS NOT NULL)
    )
);

CREATE UNIQUE INDEX payout_transfer_one_accepted_evidence
    ON payout_transfer_evidence (payout_transfer_id)
    WHERE processing_status = 'accepted';
CREATE INDEX payout_transfer_evidence_transfer_idx
    ON payout_transfer_evidence (payout_transfer_id, created_at DESC);
