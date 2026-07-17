-- CrownFi Milestone E3-E4: accepted chain evidence for positions and
-- deterministic, restart-safe settlement/refund plans.
-- A plan is not a payout; item confirmation still requires accepted chain evidence.

CREATE TABLE prediction_market_position_evidence (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    stake_intent_id UUID NOT NULL UNIQUE REFERENCES prediction_market_stake_intents(id) ON DELETE RESTRICT,
    outcome_id UUID NOT NULL REFERENCES prediction_market_outcomes(id) ON DELETE RESTRICT,
    source_stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    tx_hash TEXT NOT NULL UNIQUE CHECK (tx_hash ~ '^[0-9a-f]{64}$'),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    contract_event_id TEXT NOT NULL UNIQUE CHECK (char_length(btrim(contract_event_id)) BETWEEN 1 AND 240),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(evidence_json) = 'object'),
    accepted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (market_id, id)
);

CREATE INDEX prediction_market_position_evidence_market_idx
    ON prediction_market_position_evidence (market_id, ledger_sequence, created_at);

ALTER TABLE prediction_market_positions
    ADD CONSTRAINT prediction_market_positions_evidence_fk
    FOREIGN KEY (market_id, accepted_evidence_id)
    REFERENCES prediction_market_position_evidence (market_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE prediction_market_settlement_runs (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('payout', 'refund')),
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'submitting', 'submitted', 'confirmed', 'failed', 'cancelled')),
    winning_outcome_id UUID REFERENCES prediction_market_outcomes(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    total_stake_minor BIGINT NOT NULL CHECK (total_stake_minor >= 0),
    fee_minor BIGINT NOT NULL CHECK (fee_minor >= 0),
    distributable_minor BIGINT NOT NULL CHECK (distributable_minor >= 0),
    total_planned_minor BIGINT NOT NULL CHECK (total_planned_minor >= 0),
    requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    failure_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (market_id, kind, idempotency_key),
    CHECK (
        (kind = 'payout' AND winning_outcome_id IS NOT NULL)
        OR (kind = 'refund' AND winning_outcome_id IS NULL)
    ),
    CHECK (distributable_minor + fee_minor = total_stake_minor),
    CHECK (total_planned_minor = distributable_minor)
);

CREATE INDEX prediction_market_settlement_runs_market_idx
    ON prediction_market_settlement_runs (market_id, created_at DESC);

CREATE TABLE prediction_market_settlement_items (
    id UUID PRIMARY KEY,
    settlement_run_id UUID NOT NULL REFERENCES prediction_market_settlement_runs(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES prediction_market_positions(id) ON DELETE RESTRICT,
    recipient_stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    principal_minor BIGINT NOT NULL CHECK (principal_minor > 0),
    payout_minor BIGINT NOT NULL CHECK (payout_minor >= 0),
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'submitted', 'confirmed', 'failed')),
    submitted_tx_hash TEXT CHECK (submitted_tx_hash IS NULL OR submitted_tx_hash ~ '^[0-9a-f]{64}$'),
    accepted_evidence_id UUID,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (settlement_run_id, position_id),
    UNIQUE (submitted_tx_hash)
);

CREATE INDEX prediction_market_settlement_items_run_idx
    ON prediction_market_settlement_items (settlement_run_id, status, created_at);
