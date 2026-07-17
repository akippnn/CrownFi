use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/voting/rounds/:round_id/snapshot",
            post(create_snapshot).get(get_snapshot),
        )
        .route(
            "/voting/receipts/:receipt_hash/proof",
            get(get_receipt_proof),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct VotingSnapshotRecord {
    id: Uuid,
    organization_id: Uuid,
    pageant_id: Uuid,
    round_id: Uuid,
    version: i16,
    status: String,
    total_votes: i64,
    tally_sha256: String,
    merkle_root: String,
    tally_json: Value,
    anchor_tx_hash: Option<String>,
    anchor_contract_event_id: Option<String>,
    accepted_evidence_id: Option<Uuid>,
    created_by_user_id: Uuid,
    created_at: OffsetDateTime,
    anchored_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct SnapshotTallyEntry {
    pageant_contestant_id: Uuid,
    display_name: String,
    sash: Option<String>,
    votes: i64,
}

#[derive(Debug, Clone, FromRow)]
struct SnapshotVote {
    vote_id: Uuid,
    pageant_contestant_id: Uuid,
    receipt_hash: String,
}

#[derive(Debug, Clone, FromRow)]
struct SnapshotLeafRecord {
    snapshot_id: Uuid,
    receipt_hash: String,
    leaf_index: i64,
    leaf_hash: String,
}

#[derive(Debug, Clone, Serialize)]
struct ProofStep {
    position: &'static str,
    hash: String,
}

#[derive(Debug, Clone, Serialize)]
struct ReceiptProofResponse {
    snapshot_id: Uuid,
    round_id: Uuid,
    snapshot_status: String,
    receipt_hash: String,
    leaf_index: i64,
    leaf_hash: String,
    merkle_root: String,
    proof: Vec<ProofStep>,
}

async fn create_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(round_id): Path<Uuid>,
) -> Result<(StatusCode, Json<VotingSnapshotRecord>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let round = sqlx::query_as::<_, (Uuid, Uuid, String)>(
        "SELECT organization_id, pageant_id, status FROM voting_rounds WHERE id = $1 FOR UPDATE",
    )
    .bind(round_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor_tx(&mut tx, round.0, actor_user_id).await?;
    if !matches!(round.2.as_str(), "closed" | "anchored") {
        return Err(ApiError::Conflict("voting_round_not_closed"));
    }

    if let Some(snapshot_id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM voting_snapshots WHERE round_id = $1 FOR UPDATE",
    )
    .bind(round_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        tx.commit().await.map_err(map_database_error)?;
        return Ok((
            StatusCode::OK,
            Json(load_snapshot(pool, snapshot_id).await?),
        ));
    }

    let tally = sqlx::query_as::<_, SnapshotTallyEntry>(
        "SELECT pc.id AS pageant_contestant_id, c.display_name, pc.sash, COUNT(v.id)::BIGINT AS votes FROM voting_round_contestants vrc JOIN pageant_contestants pc ON pc.id = vrc.pageant_contestant_id JOIN contestants c ON c.id = pc.contestant_id LEFT JOIN votes v ON v.round_id = vrc.round_id AND v.pageant_contestant_id = pc.id WHERE vrc.round_id = $1 GROUP BY pc.id, c.display_name, pc.sash, vrc.sort_order ORDER BY vrc.sort_order, pc.id",
    )
    .bind(round_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(map_database_error)?;
    let votes = sqlx::query_as::<_, SnapshotVote>(
        "SELECT id AS vote_id, pageant_contestant_id, receipt_hash FROM votes WHERE round_id = $1 ORDER BY receipt_hash, id FOR SHARE",
    )
    .bind(round_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let total_votes = i64::try_from(votes.len())
        .map_err(|_| ApiError::InvalidRequest("voting_snapshot_too_large"))?;
    let tally_total = tally.iter().try_fold(0_i64, |total, entry| {
        total
            .checked_add(entry.votes)
            .ok_or(ApiError::InvalidRequest("voting_tally_overflow"))
    })?;
    if total_votes != tally_total {
        return Err(ApiError::Conflict("voting_snapshot_tally_mismatch"));
    }

    let tally_json = serde_json::to_value(&tally)
        .map_err(|_| ApiError::InvalidRequest("voting_tally_serialization_failed"))?;
    let tally_bytes = serde_json::to_vec(&tally_json)
        .map_err(|_| ApiError::InvalidRequest("voting_tally_serialization_failed"))?;
    let tally_sha256 = hash_bytes(&tally_bytes);
    let leaf_hashes = votes
        .iter()
        .map(|vote| {
            hash_text(&format!(
                "crownfi-vote-leaf-v1|{round_id}|{}|{}",
                vote.receipt_hash, vote.pageant_contestant_id
            ))
        })
        .collect::<Vec<_>>();
    let merkle_root = merkle_root(&leaf_hashes);
    let snapshot_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO voting_snapshots (id, organization_id, pageant_id, round_id, version, status, total_votes, tally_sha256, merkle_root, tally_json, created_by_user_id) VALUES ($1,$2,$3,$4,1,'created',$5,$6,$7,$8,$9)",
    )
    .bind(snapshot_id)
    .bind(round.0)
    .bind(round.1)
    .bind(round_id)
    .bind(total_votes)
    .bind(&tally_sha256)
    .bind(&merkle_root)
    .bind(&tally_json)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    for (index, (vote, leaf_hash)) in votes.iter().zip(&leaf_hashes).enumerate() {
        let leaf_index = i64::try_from(index)
            .map_err(|_| ApiError::InvalidRequest("voting_snapshot_too_large"))?;
        sqlx::query(
            "INSERT INTO voting_snapshot_leaves (snapshot_id, vote_id, receipt_hash, leaf_index, leaf_hash) VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(snapshot_id)
        .bind(vote.vote_id)
        .bind(&vote.receipt_hash)
        .bind(leaf_index)
        .bind(leaf_hash)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    write_audit(
        &mut tx,
        round.0,
        actor_user_id,
        "voting_snapshot.create",
        snapshot_id,
        json!({
            "round_id": round_id,
            "total_votes": total_votes,
            "tally_sha256": tally_sha256,
            "merkle_root": merkle_root,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(load_snapshot(pool, snapshot_id).await?),
    ))
}

async fn get_snapshot(
    State(state): State<AppState>,
    Path(round_id): Path<Uuid>,
) -> Result<Json<VotingSnapshotRecord>, ApiError> {
    let pool = database_pool(&state)?;
    let snapshot_id =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM voting_snapshots WHERE round_id = $1")
            .bind(round_id)
            .fetch_optional(pool)
            .await
            .map_err(map_database_error)?
            .ok_or(ApiError::NotFound)?;
    Ok(Json(load_snapshot(pool, snapshot_id).await?))
}

async fn get_receipt_proof(
    State(state): State<AppState>,
    Path(receipt_hash): Path<String>,
) -> Result<Json<ReceiptProofResponse>, ApiError> {
    let receipt_hash = validate_hash(receipt_hash, "invalid_vote_receipt_hash")?;
    let pool = database_pool(&state)?;
    let leaf = sqlx::query_as::<_, SnapshotLeafRecord>(
        "SELECT snapshot_id, receipt_hash, leaf_index, leaf_hash FROM voting_snapshot_leaves WHERE receipt_hash = $1",
    )
    .bind(&receipt_hash)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let snapshot = load_snapshot(pool, leaf.snapshot_id).await?;
    let leaves = sqlx::query_scalar::<_, String>(
        "SELECT leaf_hash FROM voting_snapshot_leaves WHERE snapshot_id = $1 ORDER BY leaf_index",
    )
    .bind(leaf.snapshot_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let index = usize::try_from(leaf.leaf_index)
        .map_err(|_| ApiError::InvalidRequest("invalid_vote_leaf_index"))?;
    if index >= leaves.len() || leaves[index] != leaf.leaf_hash {
        return Err(ApiError::Conflict("voting_snapshot_leaf_drift"));
    }
    let proof = merkle_proof(&leaves, index)?;
    if !verify_proof(&leaf.leaf_hash, &proof, &snapshot.merkle_root) {
        return Err(ApiError::Conflict("voting_snapshot_proof_invalid"));
    }

    Ok(Json(ReceiptProofResponse {
        snapshot_id: snapshot.id,
        round_id: snapshot.round_id,
        snapshot_status: snapshot.status,
        receipt_hash: leaf.receipt_hash,
        leaf_index: leaf.leaf_index,
        leaf_hash: leaf.leaf_hash,
        merkle_root: snapshot.merkle_root,
        proof,
    }))
}

async fn load_snapshot(pool: &PgPool, snapshot_id: Uuid) -> Result<VotingSnapshotRecord, ApiError> {
    sqlx::query_as::<_, VotingSnapshotRecord>(
        "SELECT id, organization_id, pageant_id, round_id, version, status, total_votes, tally_sha256, merkle_root, tally_json, anchor_tx_hash, anchor_contract_event_id, accepted_evidence_id, created_by_user_id, created_at, anchored_at FROM voting_snapshots WHERE id = $1",
    )
    .bind(snapshot_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,'voting_snapshot',$5,$6)",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(actor_user_id)
    .bind(action)
    .bind(entity_id)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

fn merkle_root(leaves: &[String]) -> String {
    if leaves.is_empty() {
        return hash_text("crownfi-empty-merkle-v1");
    }
    let mut level = leaves.to_vec();
    while level.len() > 1 {
        let mut next = Vec::with_capacity(level.len().div_ceil(2));
        for pair in level.chunks(2) {
            let left = &pair[0];
            let right = pair.get(1).unwrap_or(&pair[0]);
            next.push(hash_node(left, right));
        }
        level = next;
    }
    level.remove(0)
}

fn merkle_proof(leaves: &[String], mut index: usize) -> Result<Vec<ProofStep>, ApiError> {
    if leaves.is_empty() || index >= leaves.len() {
        return Err(ApiError::InvalidRequest("invalid_vote_leaf_index"));
    }
    let mut level = leaves.to_vec();
    let mut proof = Vec::new();
    while level.len() > 1 {
        let sibling_index = if index % 2 == 0 {
            (index + 1).min(level.len() - 1)
        } else {
            index - 1
        };
        proof.push(ProofStep {
            position: if index % 2 == 0 { "right" } else { "left" },
            hash: level[sibling_index].clone(),
        });
        let mut next = Vec::with_capacity(level.len().div_ceil(2));
        for pair in level.chunks(2) {
            let left = &pair[0];
            let right = pair.get(1).unwrap_or(&pair[0]);
            next.push(hash_node(left, right));
        }
        index /= 2;
        level = next;
    }
    Ok(proof)
}

fn verify_proof(leaf_hash: &str, proof: &[ProofStep], expected_root: &str) -> bool {
    let mut current = leaf_hash.to_string();
    for step in proof {
        current = if step.position == "left" {
            hash_node(&step.hash, &current)
        } else {
            hash_node(&current, &step.hash)
        };
    }
    current == expected_root
}

fn hash_node(left: &str, right: &str) -> String {
    hash_text(&format!("crownfi-merkle-node-v1|{left}|{right}"))
}

fn hash_text(value: &str) -> String {
    hash_bytes(value.as_bytes())
}

fn hash_bytes(value: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value);
    hex::encode(hasher.finalize())
}

fn validate_hash(value: String, code: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest(code))
    }
}

fn require_web_actor(state: &AppState, headers: &HeaderMap) -> Result<Uuid, ApiError> {
    let provided = headers
        .get("x-crownfi-web-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if state.config.web_internal_token.is_empty() || provided != state.config.web_internal_token {
        return Err(ApiError::Unauthorized);
    }
    headers
        .get("x-crownfi-user-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)
}

async fn require_organization_editor_tx(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $2 AND status = 'active' AND role IN ('owner','admin')) OR EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner','admin','editor'))",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_database_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("voting_snapshot_already_exists"),
            Some("23503") => ApiError::InvalidRequest("voting_snapshot_resource_missing"),
            Some("23514") | Some("22P02") => {
                ApiError::InvalidRequest("voting_snapshot_constraint_failed")
            }
            _ => {
                tracing::error!(error = %error, "voting snapshot database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "voting snapshot database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merkle_proofs_verify_for_odd_leaf_counts() {
        let leaves = ["a", "b", "c"]
            .into_iter()
            .map(hash_text)
            .collect::<Vec<_>>();
        let root = merkle_root(&leaves);
        for (index, leaf) in leaves.iter().enumerate() {
            let proof = merkle_proof(&leaves, index).unwrap();
            assert!(verify_proof(leaf, &proof, &root));
        }
    }

    #[test]
    fn empty_root_is_stable() {
        assert_eq!(merkle_root(&[]), hash_text("crownfi-empty-merkle-v1"));
    }
}
