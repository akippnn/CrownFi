-- CrownFi identity, first-admin setup, and hosted-pageant configuration.

CREATE TABLE site_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    site_name TEXT NOT NULL DEFAULT 'CrownFi'
        CHECK (char_length(btrim(site_name)) BETWEEN 1 AND 160),
    stellar_network TEXT NOT NULL DEFAULT 'testnet'
        CHECK (stellar_network IN ('testnet', 'public')),
    mainnet_enabled BOOLEAN NOT NULL DEFAULT false,
    default_pageant_id UUID REFERENCES pageants(id) ON DELETE SET NULL,
    pageant_selector_enabled BOOLEAN NOT NULL DEFAULT false,
    setup_completed_at TIMESTAMPTZ,
    setup_completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE site_administrators (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'removed')),
    granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_auth_challenges (
    id UUID PRIMARY KEY,
    address TEXT NOT NULL CHECK (address ~ '^G[A-Z2-7]{55}$'),
    network TEXT NOT NULL CHECK (network IN ('testnet', 'public')),
    purpose TEXT NOT NULL CHECK (purpose IN ('login', 'link', 'setup')),
    requested_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 32 AND 4000),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((purpose = 'link' AND requested_user_id IS NOT NULL) OR purpose <> 'link')
);

CREATE INDEX wallet_auth_challenges_lookup_idx
    ON wallet_auth_challenges (id, address, network, expires_at)
    WHERE consumed_at IS NULL;

CREATE TABLE integration_settings (
    id UUID PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    protected_value TEXT NOT NULL CHECK (protected_value LIKE 'v1.%'),
    value_suffix TEXT,
    validation_status TEXT NOT NULL DEFAULT 'not_validated'
        CHECK (validation_status IN ('not_validated', 'valid', 'invalid', 'unavailable')),
    last_validated_at TIMESTAMPTZ,
    updated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider)
);

CREATE INDEX stellar_accounts_user_network_idx
    ON stellar_accounts (user_id, network, created_at);
