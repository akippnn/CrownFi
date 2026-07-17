-- CrownFi Milestone D3: preserve every accepted mint/transfer event while the
-- issuance row points at the one current owner projection. The initial schema
-- allowed only one evidence row; transfers require immutable ownership history.

ALTER TABLE ticket_ownership_evidence
    DROP CONSTRAINT ticket_ownership_evidence_ticket_issuance_id_key,
    DROP CONSTRAINT ticket_ownership_evidence_token_id_key,
    DROP CONSTRAINT ticket_ownership_evidence_transaction_hash_key;

ALTER TABLE ticket_ownership_evidence
    ADD COLUMN event_kind TEXT NOT NULL DEFAULT 'mint'
        CHECK (event_kind IN ('mint', 'transfer'));

CREATE UNIQUE INDEX ticket_ownership_evidence_event_identity
    ON ticket_ownership_evidence (transaction_hash, contract_event_id);
CREATE INDEX ticket_ownership_evidence_token_history_idx
    ON ticket_ownership_evidence (token_id, ledger_sequence, accepted_at);
CREATE INDEX ticket_ownership_evidence_issuance_history_idx
    ON ticket_ownership_evidence (ticket_issuance_id, ledger_sequence, accepted_at);

CREATE TABLE ticket_transfer_requests (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ticket_issuance_id UUID NOT NULL REFERENCES ticket_issuances(id) ON DELETE RESTRICT,
    token_id TEXT NOT NULL CHECK (char_length(btrim(token_id)) BETWEEN 1 AND 240),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    from_stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    to_stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    policy TEXT NOT NULL CHECK (policy IN ('organizer_approved', 'open')),
    status TEXT NOT NULL
        CHECK (status IN ('requested', 'approved', 'submitted', 'confirmed', 'rejected', 'cancelled', 'failed')),
    idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    review_reason TEXT,
    submitted_tx_hash TEXT CHECK (submitted_tx_hash IS NULL OR submitted_tx_hash ~ '^[0-9a-f]{64}$'),
    accepted_evidence_id UUID,
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, from_user_id, idempotency_key),
    CHECK (from_stellar_account_id <> to_stellar_account_id),
    CHECK (from_user_id <> to_user_id),
    CHECK (
        (status = 'requested' AND reviewed_at IS NULL AND submitted_at IS NULL AND confirmed_at IS NULL)
        OR (status = 'approved' AND reviewed_at IS NOT NULL AND submitted_at IS NULL AND confirmed_at IS NULL)
        OR (status = 'submitted' AND reviewed_at IS NOT NULL AND submitted_tx_hash IS NOT NULL AND submitted_at IS NOT NULL AND confirmed_at IS NULL)
        OR (status = 'confirmed' AND reviewed_at IS NOT NULL AND submitted_tx_hash IS NOT NULL AND submitted_at IS NOT NULL AND accepted_evidence_id IS NOT NULL AND confirmed_at IS NOT NULL)
        OR status IN ('rejected', 'cancelled', 'failed')
    )
);

CREATE UNIQUE INDEX ticket_transfer_one_active_per_issuance
    ON ticket_transfer_requests (ticket_issuance_id)
    WHERE status IN ('requested', 'approved', 'submitted');
CREATE INDEX ticket_transfer_requests_owner_idx
    ON ticket_transfer_requests (from_user_id, status, created_at DESC);
CREATE INDEX ticket_transfer_requests_organization_idx
    ON ticket_transfer_requests (organization_id, status, created_at DESC);

ALTER TABLE ticket_transfer_requests
    ADD CONSTRAINT ticket_transfer_requests_evidence_fk
    FOREIGN KEY (ticket_issuance_id, accepted_evidence_id)
    REFERENCES ticket_ownership_evidence (ticket_issuance_id, id)
    DEFERRABLE INITIALLY DEFERRED;
