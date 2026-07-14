-- CrownFi Milestone C4: database-backed contract registry, durable Stellar
-- chain evidence, cursors, and reconciliation. Application payment state may
-- advance only through accepted rows created from indexed chain evidence.

CREATE TABLE contract_deployments (
    id UUID PRIMARY KEY,
    network TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
    contract_kind TEXT NOT NULL CHECK (char_length(btrim(contract_kind)) BETWEEN 1 AND 100),
    contract_id TEXT NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
    wasm_sha256 TEXT CHECK (wasm_sha256 IS NULL OR wasm_sha256 ~ '^[0-9a-f]{64}$'),
    source_commit TEXT CHECK (source_commit IS NULL OR source_commit ~ '^[0-9a-f]{40}$'),
    deployment_tx_hash TEXT CHECK (deployment_tx_hash IS NULL OR deployment_tx_hash ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL DEFAULT 'recorded_unverified'
        CHECK (status IN ('recorded_unverified', 'verified', 'deprecated')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, contract_kind, contract_id)
);

CREATE INDEX contract_deployments_kind_status_idx
    ON contract_deployments (network, contract_kind, status, created_at DESC);

CREATE TABLE stellar_chain_cursors (
    id UUID PRIMARY KEY,
    consumer_name TEXT NOT NULL UNIQUE
        CHECK (char_length(btrim(consumer_name)) BETWEEN 1 AND 120),
    network TEXT NOT NULL CHECK (network = 'testnet'),
    cursor_value TEXT NOT NULL CHECK (char_length(btrim(cursor_value)) BETWEEN 1 AND 200),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stellar_chain_evidence (
    id UUID PRIMARY KEY,
    transaction_intent_id UUID NOT NULL REFERENCES transaction_intents(id) ON DELETE CASCADE,
    stellar_transaction_id UUID NOT NULL REFERENCES stellar_transactions(id) ON DELETE CASCADE,
    network TEXT NOT NULL CHECK (network = 'testnet'),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^[0-9a-f]{64}$'),
    ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
    operation_index INTEGER NOT NULL CHECK (operation_index >= 0),
    paging_token TEXT NOT NULL CHECK (char_length(btrim(paging_token)) BETWEEN 1 AND 200),
    source_account TEXT NOT NULL CHECK (source_account ~ '^G[A-Z2-7]{55}$'),
    destination_account TEXT NOT NULL CHECK (destination_account ~ '^G[A-Z2-7]{55}$'),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    memo_text TEXT NOT NULL CHECK (octet_length(memo_text) BETWEEN 1 AND 28),
    transaction_successful BOOLEAN NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL,
    evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
    raw_transaction JSONB NOT NULL,
    raw_operation JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, transaction_hash, operation_index),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE INDEX stellar_chain_evidence_intent_idx
    ON stellar_chain_evidence (transaction_intent_id, created_at DESC);
CREATE INDEX stellar_chain_evidence_ledger_idx
    ON stellar_chain_evidence (network, ledger_sequence, paging_token);

CREATE TABLE stellar_reconciliation_results (
    id UUID PRIMARY KEY,
    transaction_intent_id UUID NOT NULL UNIQUE REFERENCES transaction_intents(id) ON DELETE CASCADE,
    chain_evidence_id UUID NOT NULL UNIQUE REFERENCES stellar_chain_evidence(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
    failure_code TEXT,
    expected JSONB NOT NULL,
    actual JSONB NOT NULL,
    reconciled_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (status = 'accepted' AND failure_code IS NULL)
        OR
        (status = 'rejected' AND failure_code IS NOT NULL)
    )
);

CREATE INDEX stellar_reconciliation_status_idx
    ON stellar_reconciliation_results (status, reconciled_at DESC);
