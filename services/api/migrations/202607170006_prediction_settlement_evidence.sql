-- CrownFi Milestone E4: settlement submissions remain pending until exact
-- indexed payout/refund evidence is accepted. Each plan item may confirm once,
-- while one Stellar transaction may carry several independently indexed ops.

CREATE TABLE prediction_market_settlement_evidence (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    settlement_run_id UUID NOT NULL REFERENCES prediction_market_settlement_runs(id) ON DELETE CASCADE,
    settlement_item_id UUID NOT NULL UNIQUE REFERENCES prediction_market_settlement_items(id) ON DELETE RESTRICT,
    recipient_stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    operation_index INTEGER NOT NULL CHECK (operation_index >= 0),
    event_reference TEXT NOT NULL UNIQUE CHECK (char_length(btrim(event_reference)) BETWEEN 1 AND 240),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(evidence_json) = 'object'),
    accepted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_hash, operation_index),
    UNIQUE (settlement_item_id, id)
);

CREATE INDEX prediction_market_settlement_evidence_run_idx
    ON prediction_market_settlement_evidence (settlement_run_id, ledger_sequence, operation_index);

ALTER TABLE prediction_market_settlement_items
    ADD CONSTRAINT prediction_market_settlement_items_evidence_fk
    FOREIGN KEY (id, accepted_evidence_id)
    REFERENCES prediction_market_settlement_evidence (settlement_item_id, id)
    DEFERRABLE INITIALLY DEFERRED;
