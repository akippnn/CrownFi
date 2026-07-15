-- CrownFi centralized authorization decision evidence and expanded reviewed roles.

ALTER TABLE organization_members
    DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
    ADD CONSTRAINT organization_members_role_check
    CHECK (role IN ('owner', 'admin', 'editor', 'operator', 'auditor', 'viewer'));

ALTER TABLE site_administrators
    DROP CONSTRAINT IF EXISTS site_administrators_role_check;

ALTER TABLE site_administrators
    ADD CONSTRAINT site_administrators_role_check
    CHECK (role IN ('owner', 'admin', 'operator', 'auditor'));

CREATE TABLE authorization_decisions (
    id UUID PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    capability TEXT NOT NULL
        CHECK (char_length(capability) BETWEEN 1 AND 120),
    resource_type TEXT
        CHECK (resource_type IS NULL OR char_length(resource_type) BETWEEN 1 AND 120),
    resource_id UUID,
    decision TEXT NOT NULL
        CHECK (decision IN ('allow', 'deny')),
    reason TEXT NOT NULL
        CHECK (char_length(reason) BETWEEN 1 AND 200),
    request_method TEXT NOT NULL
        CHECK (char_length(request_method) BETWEEN 1 AND 16),
    request_path TEXT NOT NULL
        CHECK (char_length(request_path) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX authorization_decisions_actor_created_idx
    ON authorization_decisions (actor_user_id, created_at DESC);

CREATE INDEX authorization_decisions_organization_created_idx
    ON authorization_decisions (organization_id, created_at DESC);

CREATE INDEX authorization_decisions_resource_created_idx
    ON authorization_decisions (resource_type, resource_id, created_at DESC)
    WHERE resource_id IS NOT NULL;

CREATE INDEX authorization_decisions_denied_created_idx
    ON authorization_decisions (created_at DESC)
    WHERE decision = 'deny';
