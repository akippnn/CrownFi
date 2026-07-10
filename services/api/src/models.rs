use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub status: String,
    pub venue: String,
    pub starts_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub event_id: String,
    pub name: String,
    pub voting_status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Contestant {
    pub id: String,
    pub event_id: String,
    pub category_id: String,
    pub name: String,
    pub country: String,
    pub sash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VoteRequest {
    pub category_id: String,
    pub voter_id: String,
    pub contestant_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VoteReceipt {
    pub id: String,
    pub event_id: String,
    pub category_id: String,
    pub voter_id: String,
    pub contestant_id: String,
    pub leaf_hash: String,
    pub mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TallyEntry {
    pub contestant_id: String,
    pub votes: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TallyResponse {
    pub event_id: String,
    pub category_id: String,
    pub total_votes: u64,
    pub entries: Vec<TallyEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotRequest {
    pub category_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub event_id: String,
    pub category_id: String,
    pub snapshot_hash: String,
    pub merkle_root: String,
    pub total_votes: u64,
    pub anchor_tx: Option<String>,
    pub mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnchorResponse {
    pub ok: bool,
    pub snapshot_id: String,
    pub tx_hash: String,
    pub mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifyResponse {
    pub ok: bool,
    pub snapshot: Snapshot,
    pub message: String,
}
