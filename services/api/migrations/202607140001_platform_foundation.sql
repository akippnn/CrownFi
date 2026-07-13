-- CrownFi Milestone B1: canonical platform, tenancy, contestant-content, and media metadata.
-- This migration intentionally contains no demo seed data.

CREATE TABLE users (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('invited', 'active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (email IS NULL OR char_length(btrim(email)) BETWEEN 3 AND 320)
);

CREATE UNIQUE INDEX users_email_unique
    ON users (lower(email))
    WHERE email IS NOT NULL;

CREATE TABLE stellar_accounts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    network TEXT NOT NULL CHECK (network IN ('testnet', 'public', 'futurenet', 'standalone')),
    address TEXT NOT NULL CHECK (address ~ '^[GM][A-Z2-7]{55}$'),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, address)
);

CREATE UNIQUE INDEX stellar_accounts_one_primary_per_network
    ON stellar_accounts (user_id, network)
    WHERE is_primary;

CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('pending', 'active', 'suspended', 'archived')),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (slug)
);

CREATE TABLE organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
    invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX organization_members_user_idx ON organization_members (user_id);

CREATE TABLE pageants (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'active', 'completed', 'archived')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
    venue_name TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, slug),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX pageants_organization_status_idx ON pageants (organization_id, status);

CREATE TABLE contestants (
    id UUID PRIMARY KEY,
    legal_name TEXT,
    display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 200),
    biography TEXT,
    country_code TEXT CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pageant_contestants (
    id UUID PRIMARY KEY,
    pageant_id UUID NOT NULL REFERENCES pageants(id) ON DELETE CASCADE,
    contestant_id UUID NOT NULL REFERENCES contestants(id) ON DELETE RESTRICT,
    sash TEXT,
    contestant_number INTEGER CHECK (contestant_number IS NULL OR contestant_number > 0),
    country_representation TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'withdrawn', 'disqualified', 'archived')),
    payout_stellar_account_id UUID REFERENCES stellar_accounts(id) ON DELETE SET NULL,
    profile_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(profile_json) = 'object'),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pageant_id, contestant_id)
);

CREATE UNIQUE INDEX pageant_contestants_sash_unique
    ON pageant_contestants (pageant_id, lower(sash))
    WHERE sash IS NOT NULL;

CREATE UNIQUE INDEX pageant_contestants_number_unique
    ON pageant_contestants (pageant_id, contestant_number)
    WHERE contestant_number IS NOT NULL;

CREATE INDEX pageant_contestants_pageant_status_idx
    ON pageant_contestants (pageant_id, status, sort_order);

CREATE TABLE categories (
    id UUID PRIMARY KEY,
    pageant_id UUID NOT NULL REFERENCES pageants(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'open', 'closed', 'archived')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pageant_id, slug)
);

CREATE INDEX categories_pageant_status_idx ON categories (pageant_id, status, sort_order);

CREATE TABLE contestant_category_memberships (
    pageant_contestant_id UUID NOT NULL REFERENCES pageant_contestants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pageant_contestant_id, category_id)
);

CREATE TABLE contestant_sections (
    id UUID PRIMARY KEY,
    pageant_contestant_id UUID NOT NULL REFERENCES pageant_contestants(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (
        kind IN (
            'overview', 'biography', 'advocacy', 'gallery', 'achievements',
            'collectibles', 'support', 'sponsors', 'social-links', 'custom'
        )
    ),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(settings_json) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pageant_contestant_id, slug)
);

CREATE INDEX contestant_sections_render_idx
    ON contestant_sections (pageant_contestant_id, is_visible, sort_order);

CREATE TABLE media_assets (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    storage_provider TEXT NOT NULL DEFAULT 'r2' CHECK (storage_provider = 'r2'),
    bucket TEXT NOT NULL CHECK (char_length(btrim(bucket)) BETWEEN 1 AND 255),
    object_key TEXT NOT NULL CHECK (char_length(btrim(object_key)) BETWEEN 1 AND 1024),
    original_filename TEXT NOT NULL CHECK (char_length(btrim(original_filename)) BETWEEN 1 AND 255),
    content_type TEXT NOT NULL CHECK (content_type LIKE 'image/%'),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'unlisted', 'public')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
    alt_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (storage_provider, bucket, object_key)
);

CREATE INDEX media_assets_organization_status_idx
    ON media_assets (organization_id, status, created_at DESC);
CREATE INDEX media_assets_sha256_idx ON media_assets (sha256);

CREATE TABLE media_variants (
    id UUID PRIMARY KEY,
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    variant_kind TEXT NOT NULL CHECK (char_length(btrim(variant_kind)) BETWEEN 1 AND 64),
    object_key TEXT NOT NULL CHECK (char_length(btrim(object_key)) BETWEEN 1 AND 1024),
    content_type TEXT NOT NULL CHECK (content_type LIKE 'image/%'),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (media_asset_id, variant_kind),
    UNIQUE (object_key)
);

CREATE TABLE contestant_media (
    id UUID PRIMARY KEY,
    pageant_contestant_id UUID NOT NULL REFERENCES pageant_contestants(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('portrait', 'banner', 'gallery', 'section')),
    caption TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pageant_contestant_id, media_asset_id, role)
);

CREATE UNIQUE INDEX contestant_media_single_portrait
    ON contestant_media (pageant_contestant_id)
    WHERE role = 'portrait';

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 160),
    entity_type TEXT NOT NULL CHECK (char_length(btrim(entity_type)) BETWEEN 1 AND 120),
    entity_id UUID,
    request_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_organization_created_idx
    ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx
    ON audit_logs (entity_type, entity_id, created_at DESC);
