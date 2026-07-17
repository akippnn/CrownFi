-- CrownFi Milestone D: ticket events, ticket-specific catalogue metadata,
-- atomic reservations, issuance projections, and replay-resistant check-in records.
-- Payment and ownership projections remain chain-authoritative.

CREATE TABLE ticket_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pageant_id UUID NOT NULL REFERENCES pageants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    description TEXT,
    venue_name TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'on_sale', 'off_sale', 'completed', 'cancelled', 'archived')),
    default_transfer_policy TEXT NOT NULL DEFAULT 'non_transferable'
        CHECK (default_transfer_policy IN ('non_transferable', 'organizer_approved', 'open')),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pageant_id, slug),
    CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX ticket_events_public_idx
    ON ticket_events (pageant_id, status, starts_at);
CREATE INDEX ticket_events_organization_idx
    ON ticket_events (organization_id, status, created_at DESC);

CREATE TABLE ticket_products (
    id UUID PRIMARY KEY,
    ticket_event_id UUID NOT NULL REFERENCES ticket_events(id) ON DELETE CASCADE,
    product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE RESTRICT,
    tier_name TEXT NOT NULL CHECK (char_length(btrim(tier_name)) BETWEEN 1 AND 120),
    per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit BETWEEN 1 AND 20),
    sale_starts_at TIMESTAMPTZ NOT NULL,
    sale_ends_at TIMESTAMPTZ NOT NULL,
    transfer_policy TEXT NOT NULL
        CHECK (transfer_policy IN ('non_transferable', 'organizer_approved', 'open')),
    resale_price_cap_minor BIGINT CHECK (resale_price_cap_minor IS NULL OR resale_price_cap_minor > 0),
    check_in_policy JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(check_in_policy) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sale_ends_at > sale_starts_at)
);

CREATE INDEX ticket_products_event_idx
    ON ticket_products (ticket_event_id, sale_starts_at, sale_ends_at);

CREATE TABLE ticket_reservations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ticket_product_id UUID NOT NULL REFERENCES ticket_products(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'converted', 'released', 'expired', 'cancelled')),
    idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
    request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    converted_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, buyer_user_id, idempotency_key),
    CHECK (expires_at > created_at)
);

CREATE INDEX ticket_reservations_expiry_idx
    ON ticket_reservations (status, expires_at);
CREATE INDEX ticket_reservations_buyer_idx
    ON ticket_reservations (buyer_user_id, status, created_at DESC);

CREATE TABLE ticket_issuances (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ticket_event_id UUID NOT NULL REFERENCES ticket_events(id) ON DELETE RESTRICT,
    ticket_product_id UUID NOT NULL REFERENCES ticket_products(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owner_stellar_account_id UUID NOT NULL REFERENCES stellar_accounts(id) ON DELETE RESTRICT,
    serial_number BIGINT NOT NULL CHECK (serial_number > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'submitted', 'issued', 'transferred', 'revoked', 'failed')),
    token_id TEXT,
    issuance_tx_hash TEXT CHECK (issuance_tx_hash IS NULL OR issuance_tx_hash ~ '^[0-9a-f]{64}$'),
    accepted_evidence_id UUID,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ticket_event_id, serial_number),
    UNIQUE (token_id),
    UNIQUE (issuance_tx_hash)
);

CREATE INDEX ticket_issuances_owner_idx
    ON ticket_issuances (owner_user_id, status, created_at DESC);
CREATE INDEX ticket_issuances_order_idx
    ON ticket_issuances (order_id, status);

CREATE TABLE ticket_check_ins (
    id UUID PRIMARY KEY,
    ticket_issuance_id UUID NOT NULL UNIQUE REFERENCES ticket_issuances(id) ON DELETE RESTRICT,
    ticket_event_id UUID NOT NULL REFERENCES ticket_events(id) ON DELETE RESTRICT,
    checked_in_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    check_in_nonce_hash TEXT NOT NULL UNIQUE CHECK (check_in_nonce_hash ~ '^[0-9a-f]{64}$'),
    device_reference TEXT,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX ticket_check_ins_event_idx
    ON ticket_check_ins (ticket_event_id, checked_in_at DESC);
