-- CrownFi Milestone D3: accepted chain evidence is the authority for an issued
-- ticket and its current owner. Prepared issuance rows remain pending until an
-- indexed contract event is accepted here.

CREATE TABLE ticket_ownership_evidence (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ticket_issuance_id UUID NOT NULL UNIQUE REFERENCES ticket_issuances(id) ON DELETE RESTRICT,
    owner_stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    token_id TEXT NOT NULL UNIQUE CHECK (char_length(btrim(token_id)) BETWEEN 1 AND 240),
    transaction_hash TEXT NOT NULL UNIQUE CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    contract_event_id TEXT NOT NULL UNIQUE CHECK (char_length(btrim(contract_event_id)) BETWEEN 1 AND 240),
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(evidence_json) = 'object'),
    accepted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ticket_issuance_id, id)
);

CREATE INDEX ticket_ownership_evidence_owner_idx
    ON ticket_ownership_evidence (owner_stellar_account_id, accepted_at DESC);

ALTER TABLE ticket_issuances
    ADD CONSTRAINT ticket_issuances_accepted_evidence_fk
    FOREIGN KEY (id, accepted_evidence_id)
    REFERENCES ticket_ownership_evidence (ticket_issuance_id, id)
    DEFERRABLE INITIALLY DEFERRED;
