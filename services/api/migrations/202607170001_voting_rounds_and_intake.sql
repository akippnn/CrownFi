-- CrownFi Milestone C1-C2: durable voting rounds, eligible contestants,
-- account-bound vote intake, idempotency, and receipt material.
-- Snapshot anchoring remains a later migration; no demo votes are created here.

CREATE TABLE voting_rounds (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pageant_id UUID NOT NULL REFERENCES pageants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'open', 'closing', 'closed', 'anchored', 'cancelled')),
    opens_at TIMESTAMPTZ NOT NULL,
    closes_at TIMESTAMPTZ NOT NULL,
    max_votes_per_user SMALLINT NOT NULL DEFAULT 1 CHECK (max_votes_per_user = 1),
    eligibility_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(eligibility_json) = 'object'),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pageant_id, slug),
    CHECK (closes_at > opens_at)
);

CREATE INDEX voting_rounds_public_idx
    ON voting_rounds (pageant_id, status, opens_at, closes_at);
CREATE INDEX voting_rounds_organization_idx
    ON voting_rounds (organization_id, status, created_at DESC);

CREATE TABLE voting_round_contestants (
    round_id UUID NOT NULL REFERENCES voting_rounds(id) ON DELETE CASCADE,
    pageant_contestant_id UUID NOT NULL REFERENCES pageant_contestants(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (round_id, pageant_contestant_id),
    UNIQUE (round_id, sort_order)
);

CREATE INDEX voting_round_contestants_render_idx
    ON voting_round_contestants (round_id, sort_order);

CREATE TABLE votes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pageant_id UUID NOT NULL REFERENCES pageants(id) ON DELETE CASCADE,
    round_id UUID NOT NULL REFERENCES voting_rounds(id) ON DELETE RESTRICT,
    pageant_contestant_id UUID NOT NULL REFERENCES pageant_contestants(id) ON DELETE RESTRICT,
    voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    receipt_hash TEXT NOT NULL CHECK (receipt_hash ~ '^[0-9a-f]{64}$'),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (round_id, voter_user_id),
    UNIQUE (round_id, voter_user_id, idempotency_key),
    UNIQUE (receipt_hash)
);

CREATE INDEX votes_round_contestant_idx
    ON votes (round_id, pageant_contestant_id, accepted_at);
CREATE INDEX votes_voter_idx
    ON votes (voter_user_id, accepted_at DESC);

CREATE TABLE voting_round_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    round_id UUID NOT NULL REFERENCES voting_rounds(id) ON DELETE CASCADE,
    actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('create', 'schedule', 'open', 'close', 'cancel')),
    previous_status TEXT,
    new_status TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX voting_round_events_round_idx
    ON voting_round_events (round_id, created_at DESC);
