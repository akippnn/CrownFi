-- CrownFi Milestone C3: immutable close snapshots and privacy-preserving
-- receipt inclusion material. A snapshot is not anchored until accepted chain
-- evidence is attached by the later C4 flow.

CREATE TABLE voting_snapshots (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pageant_id UUID NOT NULL REFERENCES pageants(id) ON DELETE CASCADE,
    round_id UUID NOT NULL UNIQUE REFERENCES voting_rounds(id) ON DELETE RESTRICT,
    version SMALLINT NOT NULL DEFAULT 1 CHECK (version = 1),
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'anchor_pending', 'anchored', 'failed')),
    total_votes BIGINT NOT NULL CHECK (total_votes >= 0),
    tally_sha256 TEXT NOT NULL CHECK (tally_sha256 ~ '^[0-9a-f]{64}$'),
    merkle_root TEXT NOT NULL CHECK (merkle_root ~ '^[0-9a-f]{64}$'),
    tally_json JSONB NOT NULL CHECK (jsonb_typeof(tally_json) = 'array'),
    anchor_tx_hash TEXT CHECK (anchor_tx_hash IS NULL OR anchor_tx_hash ~ '^[0-9a-f]{64}$'),
    anchor_contract_event_id TEXT,
    accepted_evidence_id UUID,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    anchored_at TIMESTAMPTZ,
    CHECK (
        (status = 'anchored' AND anchor_tx_hash IS NOT NULL AND anchor_contract_event_id IS NOT NULL AND accepted_evidence_id IS NOT NULL AND anchored_at IS NOT NULL)
        OR status <> 'anchored'
    )
);

CREATE INDEX voting_snapshots_status_idx
    ON voting_snapshots (organization_id, status, created_at DESC);

CREATE TABLE voting_snapshot_leaves (
    snapshot_id UUID NOT NULL REFERENCES voting_snapshots(id) ON DELETE CASCADE,
    vote_id UUID NOT NULL UNIQUE REFERENCES votes(id) ON DELETE RESTRICT,
    receipt_hash TEXT NOT NULL UNIQUE CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
    leaf_index BIGINT NOT NULL CHECK (leaf_index >= 0),
    leaf_hash TEXT NOT NULL CHECK (leaf_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, leaf_index),
    UNIQUE (snapshot_id, leaf_hash)
);

CREATE INDEX voting_snapshot_leaves_receipt_idx
    ON voting_snapshot_leaves (receipt_hash, snapshot_id);
