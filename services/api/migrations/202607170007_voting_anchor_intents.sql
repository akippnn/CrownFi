-- CrownFi Milestone C4: durable, exact AuditAnchor publish intents and accepted
-- Soroban event evidence. UUID round identifiers remain off-chain; the contract
-- receives a database-allocated u32 key because AuditAnchor.publish expects u32.

CREATE SEQUENCE voting_anchor_round_key_seq
    AS BIGINT
    MINVALUE 1
    MAXVALUE 4294967295
    NO CYCLE;

CREATE TABLE voting_anchor_intents (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL UNIQUE REFERENCES voting_snapshots(id) ON DELETE RESTRICT,
    round_id UUID NOT NULL UNIQUE REFERENCES voting_rounds(id) ON DELETE RESTRICT,
    contract_deployment_id UUID NOT NULL REFERENCES contract_deployments(id) ON DELETE RESTRICT,
    contract_round_key BIGINT NOT NULL DEFAULT nextval('voting_anchor_round_key_seq')
        CHECK (contract_round_key BETWEEN 1 AND 4294967295),
    network TEXT NOT NULL CHECK (network = 'testnet'),
    contract_id TEXT NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
    function_name TEXT NOT NULL CHECK (function_name = 'publish'),
    merkle_root TEXT NOT NULL CHECK (merkle_root ~ '^[0-9a-f]{64}$'),
    tally_sha256 TEXT NOT NULL CHECK (tally_sha256 ~ '^[0-9a-f]{64}$'),
    total_votes BIGINT NOT NULL CHECK (total_votes BETWEEN 0 AND 4294967295),
    operation_json JSONB NOT NULL CHECK (jsonb_typeof(operation_json) = 'object'),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'submitted', 'confirmed', 'failed')),
    submitted_tx_hash TEXT CHECK (submitted_tx_hash IS NULL OR submitted_tx_hash ~ '^[0-9a-f]{64}$'),
    failure_code TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, contract_id, contract_round_key),
    UNIQUE (organization_id, idempotency_key),
    CHECK (
        (status = 'created' AND submitted_tx_hash IS NULL AND submitted_at IS NULL AND confirmed_at IS NULL)
        OR (status = 'submitted' AND submitted_tx_hash IS NOT NULL AND submitted_at IS NOT NULL AND confirmed_at IS NULL)
        OR (status = 'confirmed' AND submitted_tx_hash IS NOT NULL AND submitted_at IS NOT NULL AND confirmed_at IS NOT NULL)
        OR status = 'failed'
    )
);

CREATE INDEX voting_anchor_intents_status_idx
    ON voting_anchor_intents (organization_id, status, created_at DESC);

CREATE TABLE voting_anchor_evidence (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    anchor_intent_id UUID NOT NULL UNIQUE REFERENCES voting_anchor_intents(id) ON DELETE RESTRICT,
    snapshot_id UUID NOT NULL UNIQUE REFERENCES voting_snapshots(id) ON DELETE RESTRICT,
    contract_deployment_id UUID NOT NULL REFERENCES contract_deployments(id) ON DELETE RESTRICT,
    contract_round_key BIGINT NOT NULL CHECK (contract_round_key BETWEEN 1 AND 4294967295),
    contract_id TEXT NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    event_reference TEXT NOT NULL UNIQUE CHECK (char_length(btrim(event_reference)) BETWEEN 1 AND 240),
    merkle_root TEXT NOT NULL CHECK (merkle_root ~ '^[0-9a-f]{64}$'),
    tally_sha256 TEXT NOT NULL CHECK (tally_sha256 ~ '^[0-9a-f]{64}$'),
    total_votes BIGINT NOT NULL CHECK (total_votes BETWEEN 0 AND 4294967295),
    raw_event JSONB NOT NULL CHECK (jsonb_typeof(raw_event) = 'object'),
    accepted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_hash, event_reference),
    UNIQUE (snapshot_id, id)
);

CREATE INDEX voting_anchor_evidence_ledger_idx
    ON voting_anchor_evidence (ledger_sequence, created_at);

ALTER TABLE voting_snapshots
    ADD CONSTRAINT voting_snapshots_anchor_evidence_fk
    FOREIGN KEY (id, accepted_evidence_id)
    REFERENCES voting_anchor_evidence (snapshot_id, id)
    DEFERRABLE INITIALLY DEFERRED;
