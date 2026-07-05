#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

#[test]
fn publish_and_read() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let id = e.register(AuditAnchor, (admin.clone(),));
    let client = AuditAnchorClient::new(&e, &id);

    let root = BytesN::from_array(&e, &[7u8; 32]);
    let tally = BytesN::from_array(&e, &[9u8; 32]);
    client.publish(&1, &root, &tally, &42);

    let cp = client.get(&1).unwrap();
    assert_eq!(cp.total_votes, 42);
    assert_eq!(cp.merkle_root, root);
}

#[test]
#[should_panic(expected = "round already published")]
fn cannot_overwrite() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let id = e.register(AuditAnchor, (admin.clone(),));
    let client = AuditAnchorClient::new(&e, &id);
    let root = BytesN::from_array(&e, &[1u8; 32]);
    let tally = BytesN::from_array(&e, &[2u8; 32]);
    client.publish(&1, &root, &tally, &10);
    client.publish(&1, &root, &tally, &10); // must panic
}
