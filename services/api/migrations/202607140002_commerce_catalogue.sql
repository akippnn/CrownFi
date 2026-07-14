-- CrownFi Milestone C1: generic catalogue, integer Stellar pricing, inventory,
-- collectible collections/editions, and product-media relationships.
-- This migration intentionally contains no products, prices, or demo commerce data.

CREATE TABLE products (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pageant_id UUID REFERENCES pageants(id) ON DELETE CASCADE,
    pageant_contestant_id UUID REFERENCES pageant_contestants(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('collectible', 'ticket', 'merchandise', 'donation')),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, slug),
    CHECK (pageant_contestant_id IS NULL OR pageant_id IS NOT NULL)
);

CREATE INDEX products_organization_status_idx
    ON products (organization_id, status, created_at DESC);
CREATE INDEX products_pageant_status_idx
    ON products (pageant_id, status, created_at DESC)
    WHERE pageant_id IS NOT NULL;
CREATE INDEX products_contestant_status_idx
    ON products (pageant_contestant_id, status, created_at DESC)
    WHERE pageant_contestant_id IS NOT NULL;

CREATE TABLE product_prices (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    asset_code TEXT NOT NULL CHECK (asset_code ~ '^[A-Z0-9]{1,12}$'),
    asset_scale SMALLINT NOT NULL CHECK (asset_scale BETWEEN 0 AND 7),
    asset_issuer TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
    CHECK (
        (asset_code = 'XLM' AND asset_issuer IS NULL)
        OR
        (asset_code <> 'XLM' AND asset_issuer ~ '^G[A-Z2-7]{55}$')
    )
);

CREATE UNIQUE INDEX product_prices_one_active_asset
    ON product_prices (product_id, asset_code, COALESCE(asset_issuer, ''))
    WHERE is_active;
CREATE INDEX product_prices_product_active_idx
    ON product_prices (product_id, is_active, created_at DESC);

CREATE TABLE product_inventory (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    supply_limit BIGINT CHECK (supply_limit IS NULL OR supply_limit > 0),
    reserved_quantity BIGINT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    fulfilled_quantity BIGINT NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        supply_limit IS NULL
        OR reserved_quantity + fulfilled_quantity <= supply_limit
    )
);

CREATE TABLE product_media (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('primary', 'gallery', 'metadata')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, media_asset_id, role)
);

CREATE UNIQUE INDEX product_media_single_primary
    ON product_media (product_id)
    WHERE role = 'primary';
CREATE INDEX product_media_render_idx
    ON product_media (product_id, role, sort_order, created_at);

CREATE TABLE collectible_collections (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pageant_id UUID REFERENCES pageants(id) ON DELETE CASCADE,
    pageant_contestant_id UUID REFERENCES pageant_contestants(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    contract_id TEXT CHECK (contract_id IS NULL OR contract_id ~ '^C[A-Z2-7]{55}$'),
    metadata_sha256 TEXT CHECK (
        metadata_sha256 IS NULL OR metadata_sha256 ~ '^[0-9a-f]{64}$'
    ),
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, slug),
    CHECK (pageant_contestant_id IS NULL OR pageant_id IS NOT NULL)
);

CREATE INDEX collectible_collections_organization_status_idx
    ON collectible_collections (organization_id, status, created_at DESC);
CREATE INDEX collectible_collections_contestant_status_idx
    ON collectible_collections (pageant_contestant_id, status, created_at DESC)
    WHERE pageant_contestant_id IS NOT NULL;

CREATE TABLE collectible_editions (
    id UUID PRIMARY KEY,
    collection_id UUID NOT NULL REFERENCES collectible_collections(id) ON DELETE CASCADE,
    product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE RESTRICT,
    edition_number INTEGER NOT NULL CHECK (edition_number > 0),
    supply_limit BIGINT NOT NULL CHECK (supply_limit > 0),
    mint_policy TEXT NOT NULL DEFAULT 'on_purchase'
        CHECK (mint_policy IN ('on_purchase', 'pre_minted', 'manual')),
    contract_id TEXT CHECK (contract_id IS NULL OR contract_id ~ '^C[A-Z2-7]{55}$'),
    metadata_sha256 TEXT CHECK (
        metadata_sha256 IS NULL OR metadata_sha256 ~ '^[0-9a-f]{64}$'
    ),
    artwork_media_asset_id UUID REFERENCES media_assets(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (collection_id, edition_number)
);

CREATE INDEX collectible_editions_collection_idx
    ON collectible_editions (collection_id, edition_number);
