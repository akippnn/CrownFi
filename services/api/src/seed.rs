use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{config::Config, database};

const DEMO_USER_ID: Uuid = Uuid::from_u128(0xc10f1000000000000000000000000001);
const DEMO_ORGANIZATION_ID: Uuid = Uuid::from_u128(0xc10f1000000000000000000000000010);
const DEMO_PAGEANT_ID: Uuid = Uuid::from_u128(0xc10f1000000000000000000000000100);
const DEMO_CATEGORY_ID: Uuid = Uuid::from_u128(0xc10f1000000000000000000000000200);
const DEMO_AUDIT_ID: Uuid = Uuid::from_u128(0xc10f1000000000000000000000000f00);

const DEMO_CONTESTANTS: &[(u128, u128, &str, &str, &str, i32)] = &[
    (
        0xc10f1000000000000000000000001001,
        0xc10f1000000000000000000000011001,
        "Ariella Santos",
        "PH",
        "PHILIPPINES",
        1,
    ),
    (
        0xc10f1000000000000000000000001002,
        0xc10f1000000000000000000000011002,
        "Mika Tanaka",
        "JP",
        "JAPAN",
        2,
    ),
    (
        0xc10f1000000000000000000000001003,
        0xc10f1000000000000000000000011003,
        "Anong Chai",
        "TH",
        "THAILAND",
        3,
    ),
];

#[derive(Debug, thiserror::Error)]
pub enum SeedError {
    #[error(transparent)]
    DatabaseInit(#[from] database::DatabaseInitError),
    #[error("DATABASE_URL is required for the explicit demo seed")]
    MissingDatabase,
    #[error("demo seed is allowed only when CROWNFI_ALLOW_DEMO_SEED=true")]
    NotAllowed,
    #[error("demo seed is forbidden in production runtime mode")]
    ProductionMode,
    #[error("failed to write demo seed data")]
    Sql(#[from] sqlx::Error),
}

pub async fn seed_demo(config: &Config) -> Result<(), SeedError> {
    if !demo_seed_allowed() {
        return Err(SeedError::NotAllowed);
    }
    if matches!(config.api_mode.as_str(), "production" | "staging") {
        return Err(SeedError::ProductionMode);
    }

    let pool = database::connect(config)
        .await?
        .ok_or(SeedError::MissingDatabase)?;
    database::migrate(config).await?;

    let mut tx = pool.begin().await?;
    seed_user(&mut tx).await?;
    seed_organization(&mut tx).await?;
    seed_pageant(&mut tx).await?;
    seed_category(&mut tx).await?;
    seed_contestants(&mut tx).await?;
    seed_audit_record(&mut tx).await?;
    tx.commit().await?;
    pool.close().await;

    Ok(())
}

fn demo_seed_allowed() -> bool {
    std::env::var("CROWNFI_ALLOW_DEMO_SEED")
        .ok()
        .is_some_and(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
}

async fn seed_user(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO users (id, display_name, email, status) VALUES ($1, $2, $3, 'active') ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, status = 'active', updated_at = now()",
    )
    .bind(DEMO_USER_ID)
    .bind("CrownFi Demo Organizer")
    .bind("demo-organizer@crownfi.invalid")
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn seed_organization(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO organizations (id, name, slug, status, created_by_user_id) VALUES ($1, $2, $3, 'active', $4) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()",
    )
    .bind(DEMO_ORGANIZATION_ID)
    .bind("CrownFi Demo Organization")
    .bind("crownfi-demo")
    .bind(DEMO_USER_ID)
    .execute(&mut **tx)
    .await?;

    let organization_id = organization_id(tx).await?;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', status = 'active', updated_at = now()",
    )
    .bind(organization_id)
    .bind(DEMO_USER_ID)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn seed_pageant(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    let organization_id = organization_id(tx).await?;
    sqlx::query(
        "INSERT INTO pageants (id, organization_id, name, slug, description, status, timezone, venue_name, created_by_user_id) VALUES ($1, $2, $3, $4, $5, 'published', 'Asia/Manila', $6, $7) ON CONFLICT (organization_id, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = 'published', timezone = EXCLUDED.timezone, venue_name = EXCLUDED.venue_name, updated_at = now()",
    )
    .bind(DEMO_PAGEANT_ID)
    .bind(organization_id)
    .bind("CrownFi International 2026")
    .bind("crownfi-international-2026")
    .bind("Explicit, repeatable demo data for local and Testnet review environments.")
    .bind("CrownFi Grand Stage")
    .bind(DEMO_USER_ID)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn seed_category(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    let pageant_id = pageant_id(tx).await?;
    sqlx::query(
        "INSERT INTO categories (id, pageant_id, name, slug, description, status, sort_order) VALUES ($1, $2, $3, $4, $5, 'open', 1) ON CONFLICT (pageant_id, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = 'open', sort_order = 1, updated_at = now()",
    )
    .bind(DEMO_CATEGORY_ID)
    .bind(pageant_id)
    .bind("Fan Choice")
    .bind("fan-choice")
    .bind("Demo fan-choice category. Voting remains a separate migration slice.")
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn seed_contestants(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    let pageant_id = pageant_id(tx).await?;
    let category_id = category_id(tx, pageant_id).await?;

    for (contestant_raw, participation_raw, display_name, country_code, sash, number) in
        DEMO_CONTESTANTS
    {
        let contestant_id = Uuid::from_u128(*contestant_raw);
        let participation_id = Uuid::from_u128(*participation_raw);
        sqlx::query(
            "INSERT INTO contestants (id, display_name, country_code, created_by_user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, country_code = EXCLUDED.country_code, updated_at = now()",
        )
        .bind(contestant_id)
        .bind(display_name)
        .bind(country_code)
        .bind(DEMO_USER_ID)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "INSERT INTO pageant_contestants (id, pageant_id, contestant_id, sash, contestant_number, country_representation, status, sort_order) VALUES ($1, $2, $3, $4, $5, $6, 'active', $5) ON CONFLICT (pageant_id, contestant_id) DO UPDATE SET sash = EXCLUDED.sash, contestant_number = EXCLUDED.contestant_number, country_representation = EXCLUDED.country_representation, status = 'active', sort_order = EXCLUDED.sort_order, updated_at = now()",
        )
        .bind(participation_id)
        .bind(pageant_id)
        .bind(contestant_id)
        .bind(sash)
        .bind(number)
        .bind(country_name(country_code))
        .execute(&mut **tx)
        .await?;

        let actual_participation_id = sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM pageant_contestants WHERE pageant_id = $1 AND contestant_id = $2",
        )
        .bind(pageant_id)
        .bind(contestant_id)
        .fetch_one(&mut **tx)
        .await?;

        sqlx::query(
            "INSERT INTO contestant_category_memberships (pageant_contestant_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(actual_participation_id)
        .bind(category_id)
        .execute(&mut **tx)
        .await?;

        seed_sections(tx, actual_participation_id, *number).await?;
    }
    Ok(())
}

async fn seed_sections(
    tx: &mut Transaction<'_, Postgres>,
    participation_id: Uuid,
    order: i32,
) -> Result<(), sqlx::Error> {
    for (offset, kind, title, slug) in [
        (1_u128, "overview", "Overview", "overview"),
        (2_u128, "advocacy", "Advocacy", "advocacy"),
        (3_u128, "gallery", "Gallery", "gallery"),
        (4_u128, "collectibles", "Collectibles", "collectibles"),
    ] {
        let section_id = Uuid::from_u128(participation_id.as_u128() + offset);
        sqlx::query(
            "INSERT INTO contestant_sections (id, pageant_contestant_id, kind, title, slug, sort_order, is_visible, settings_json) VALUES ($1, $2, $3, $4, $5, $6, true, $7) ON CONFLICT (pageant_contestant_id, slug) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, sort_order = EXCLUDED.sort_order, is_visible = true, settings_json = EXCLUDED.settings_json, updated_at = now()",
        )
        .bind(section_id)
        .bind(participation_id)
        .bind(kind)
        .bind(title)
        .bind(slug)
        .bind(offset as i32)
        .bind(serde_json::json!({"demo": true, "contestant_order": order}))
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn seed_audit_record(tx: &mut Transaction<'_, Postgres>) -> Result<(), sqlx::Error> {
    let organization_id = organization_id(tx).await?;
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, 'seed.demo.apply', 'organization', $2, $4) ON CONFLICT (id) DO NOTHING",
    )
    .bind(DEMO_AUDIT_ID)
    .bind(organization_id)
    .bind(DEMO_USER_ID)
    .bind(serde_json::json!({"profile": "demo", "explicit": true}))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn organization_id(tx: &mut Transaction<'_, Postgres>) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar("SELECT id FROM organizations WHERE slug = 'crownfi-demo'")
        .fetch_one(&mut **tx)
        .await
}

async fn pageant_id(tx: &mut Transaction<'_, Postgres>) -> Result<Uuid, sqlx::Error> {
    let organization_id = organization_id(tx).await?;
    sqlx::query_scalar(
        "SELECT id FROM pageants WHERE organization_id = $1 AND slug = 'crownfi-international-2026'",
    )
    .bind(organization_id)
    .fetch_one(&mut **tx)
    .await
}

async fn category_id(
    tx: &mut Transaction<'_, Postgres>,
    pageant_id: Uuid,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar("SELECT id FROM categories WHERE pageant_id = $1 AND slug = 'fan-choice'")
        .bind(pageant_id)
        .fetch_one(&mut **tx)
        .await
}

fn country_name(country_code: &str) -> &'static str {
    match country_code {
        "PH" => "Philippines",
        "JP" => "Japan",
        "TH" => "Thailand",
        _ => "Unknown",
    }
}

#[allow(dead_code)]
async fn assert_seed_counts(pool: &PgPool) -> Result<(i64, i64, i64), sqlx::Error> {
    let organizations =
        sqlx::query_scalar("SELECT count(*) FROM organizations WHERE slug = 'crownfi-demo'")
            .fetch_one(pool)
            .await?;
    let pageants = sqlx::query_scalar(
        "SELECT count(*) FROM pageants WHERE slug = 'crownfi-international-2026'",
    )
    .fetch_one(pool)
    .await?;
    let contestants = sqlx::query_scalar(
        "SELECT count(*) FROM pageant_contestants pc JOIN pageants p ON p.id = pc.pageant_id WHERE p.slug = 'crownfi-international-2026'",
    )
    .fetch_one(pool)
    .await?;
    Ok((organizations, pageants, contestants))
}
