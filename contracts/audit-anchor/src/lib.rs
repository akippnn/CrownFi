#![no_std]
// AuditAnchor: stores one tamper-evident checkpoint per voting round.
// The backend computes the tally off-chain and publishes only the Merkle root + tally hash here.
// Auditors read checkpoints; fans verify receipts against merkle_root off-chain.
// No external dependencies beyond soroban-sdk, so it builds cleanly.
//
// Security layers:
//  - admin.require_auth() gates publish() (set admin to a MULTISIG account in production).
//  - publish() refuses to overwrite an already-published round, so a checkpoint can never be
//    silently rewritten after the fact (this is the whole point of anchoring).
//  - a "publish" event is emitted for off-chain auditors/indexers.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env};

#[contracttype]
pub enum DataKey {
    Admin,
    Round(u32),
}

#[contracttype]
#[derive(Clone)]
pub struct Checkpoint {
    pub round_id: u32,
    pub merkle_root: BytesN<32>,
    pub tally_hash: BytesN<32>,
    pub total_votes: u32,
    pub timestamp: u64,
}

#[contract]
pub struct AuditAnchor;

#[contractimpl]
impl AuditAnchor {
    pub fn __constructor(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
    }

    // Publish the checkpoint for a round. Admin-only, and write-once per round.
    pub fn publish(
        e: Env,
        round_id: u32,
        merkle_root: BytesN<32>,
        tally_hash: BytesN<32>,
        total_votes: u32,
    ) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // Immutability guard: a round can only be anchored once.
        if e.storage().persistent().has(&DataKey::Round(round_id)) {
            panic!("round already published");
        }

        let cp = Checkpoint {
            round_id,
            merkle_root: merkle_root.clone(),
            tally_hash,
            total_votes,
            timestamp: e.ledger().timestamp(),
        };
        e.storage().persistent().set(&DataKey::Round(round_id), &cp);

        e.events().publish((symbol_short!("publish"), round_id), merkle_root);
    }

    pub fn get(e: Env, round_id: u32) -> Option<Checkpoint> {
        e.storage().persistent().get(&DataKey::Round(round_id))
    }

    pub fn admin(e: Env) -> Address {
        e.storage().instance().get(&DataKey::Admin).unwrap()
    }
}

mod test;
