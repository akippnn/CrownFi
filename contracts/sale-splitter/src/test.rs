#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn split_math() {
    // 10% platform fee on 100 -> 90 to contestant.
    let price: i128 = 100;
    let bps: i128 = 1000;
    let fee = price * bps / 10_000;
    assert_eq!(fee, 10);
    assert_eq!(price - fee, 90);
}

#[test]
#[should_panic(expected = "price must be positive")]
fn rejects_non_positive_price() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);
    let platform = Address::generate(&e);
    let id = e.register(SaleSplitter, (admin.clone(), usdc, platform, 500u32));
    let client = SaleSplitterClient::new(&e, &id);
    let contestant = Address::generate(&e);
    client.set_listing(&1, &0, &contestant, &true); // price 0 must panic
}
