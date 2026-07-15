-- CrownFi Milestone E foundation: durable, Testnet-only prediction-market
-- lifecycle, policy decisions, stake intents, positions, and governance evidence.
-- This migration does not claim a complete or production gambling workflow.

CREATE TABLE prediction_markets (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pageant_id UUID REFERENCES pageants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    question TEXT NOT NULL CHECK (char_length(btrim(question)) BETWEEN 8 AND 500),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'pending_review', 'approved', 'open', 'paused', 'closed',
            'resolution_pending', 'resolved', 'cancelled', 'settling', 'settled', 'archived'
        )),
    network TEXT NOT NULL DEFAULT 'testnet' CHECK (network = 'testnet'),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    fee_bps INTEGER NOT NULL DEFAULT 0 CHECK (fee_bps BETWEEN 0 AND 1000),
    min_stake_minor BIGINT NOT NULL CHECK (min_stake_minor > 0),
    max_stake_minor BIGINT NOT NULL CHECK (max_stake_minor >= min_stake_minor),
    max_user_exposure_minor BIGINT NOT NULL CHECK (max_user_exposure_minor >= max_stake_minor),
    max_market_exposure_minor BIGINT NOT NULL CHECK (max_market_exposure_minor >= max_user_exposure_minor),
    opens_at TIMESTAMPTZ NOT NULL,
    closes_at TIMESTAMPTZ NOT NULL,
    resolution_source TEXT NOT NULL CHECK (char_length(btrim(resolution_source)) BETWEEN 8 AND 1000),
    policy_version TEXT NOT NULL CHECK (char_length(btrim(policy_version)) BETWEEN 1 AND 120),
    winning_outcome_id UUID,
    result_evidence JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(result_evidence) = 'object'),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, slug),
    CHECK (closes_at > opens_at),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE INDEX prediction_markets_public_idx
    ON prediction_markets (status, opens_at, closes_at);
CREATE INDEX prediction_markets_organization_idx
    ON prediction_markets (organization_id, status, created_at DESC);
CREATE INDEX prediction_markets_pageant_idx
    ON prediction_markets (pageant_id, status)
    WHERE pageant_id IS NOT NULL;

CREATE TABLE prediction_market_outcomes (
    id UUID PRIMARY KEY,
    market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
    label TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 160),
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    total_active_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_active_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (market_id, code),
    UNIQUE (market_id, sort_order),
    UNIQUE (market_id, id)
);

ALTER TABLE prediction_markets
    ADD CONSTRAINT prediction_markets_winning_outcome_fk
    FOREIGN KEY (id, winning_outcome_id)
    REFERENCES prediction_market_outcomes (market_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE prediction_market_policy_decisions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    subject_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('market.open', 'stake', 'resolve', 'settle', 'refund')),
    decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'review')),
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 1000),
    policy_version TEXT NOT NULL CHECK (char_length(btrim(policy_version)) BETWEEN 1 AND 120),
    decided_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (action = 'stake' AND subject_user_id IS NOT NULL)
        OR
        (action <> 'stake' AND subject_user_id IS NULL)
    )
);

CREATE INDEX prediction_market_policy_lookup_idx
    ON prediction_market_policy_decisions
        (market_id, action, subject_user_id, created_at DESC);

CREATE TABLE prediction_market_stake_intents (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    outcome_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL DEFAULT 'awaiting_signature'
        CHECK (status IN (
            'awaiting_signature', 'signed', 'submitted', 'confirmed',
            'rejected', 'expired', 'cancelled'
        )),
    submitted_tx_hash TEXT CHECK (submitted_tx_hash IS NULL OR submitted_tx_hash ~ '^[0-9a-f]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    rejection_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id, idempotency_key),
    UNIQUE (market_id, id),
    FOREIGN KEY (market_id, outcome_id)
        REFERENCES prediction_market_outcomes (market_id, id) ON DELETE RESTRICT,
    CHECK (expires_at > created_at)
);

CREATE INDEX prediction_market_stake_intents_user_idx
    ON prediction_market_stake_intents (market_id, user_id, status, created_at DESC);
CREATE INDEX prediction_market_stake_intents_expiry_idx
    ON prediction_market_stake_intents (status, expires_at);
CREATE UNIQUE INDEX prediction_market_stake_intents_tx_hash_unique
    ON prediction_market_stake_intents (submitted_tx_hash)
    WHERE submitted_tx_hash IS NOT NULL;

CREATE TABLE prediction_market_positions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    outcome_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    stake_intent_id UUID NOT NULL UNIQUE REFERENCES prediction_market_stake_intents(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'rejected', 'settled', 'refunded')),
    accepted_evidence_id UUID,
    activated_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (market_id, id),
    FOREIGN KEY (market_id, outcome_id)
        REFERENCES prediction_market_outcomes (market_id, id) ON DELETE RESTRICT
);

CREATE INDEX prediction_market_positions_user_idx
    ON prediction_market_positions (market_id, user_id, status, created_at DESC);
CREATE INDEX prediction_market_positions_outcome_idx
    ON prediction_market_positions (market_id, outcome_id, status);

CREATE TABLE prediction_market_governance_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES prediction_markets(id) ON DELETE CASCADE,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 120),
    previous_status TEXT,
    new_status TEXT,
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 1000),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(evidence) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX prediction_market_governance_events_idx
    ON prediction_market_governance_events (market_id, created_at DESC);
