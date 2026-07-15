#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, BytesN, Env, String,
};

struct Fixture<'a> {
    e: Env,
    client: PredictionMarketClient<'a>,
    token: token::Client<'a>,
    admin: Address,
    resolver: Address,
    treasury: Address,
}

fn setup<'a>() -> Fixture<'a> {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_timestamp(1_000);

    let token_admin = Address::generate(&e);
    let sac = e.register_stellar_asset_contract_v2(token_admin);
    let token_address = sac.address();
    let token = token::Client::new(&e, &token_address);

    let admin = Address::generate(&e);
    let resolver = Address::generate(&e);
    let treasury = Address::generate(&e);
    let contract_id = e.register(PredictionMarket, ());
    let client = PredictionMarketClient::new(&e, &contract_id);
    client.initialize(&admin, &token_address);

    Fixture {
        e,
        client,
        token,
        admin,
        resolver,
        treasury,
    }
}

fn fund(fixture: &Fixture<'_>, user: &Address, amount: i128) {
    token::StellarAssetClient::new(&fixture.e, &fixture.token.address).mint(user, &amount);
}

fn market(fixture: &Fixture<'_>, fee_bps: u32, delay: u64) -> u32 {
    fixture.client.create_market(
        &String::from_str(&fixture.e, "Who wins the final category?"),
        &String::from_str(&fixture.e, "final"),
        &2,
        &2_000,
        &delay,
        &fee_bps,
        &fixture.resolver,
        &fixture.treasury,
    )
}

fn result_hash(e: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(e, &[byte; 32])
}

fn resolve(fixture: &Fixture<'_>, market_id: u32, option: u32, delay: u64) {
    fixture.e.ledger().set_timestamp(2_000);
    fixture
        .client
        .propose_resolution(&market_id, &option, &result_hash(&fixture.e, 7));
    fixture.e.ledger().set_timestamp(2_000 + delay);
    fixture.client.finalize_resolution(&market_id);
}

#[test]
fn cannot_resolve_before_close() {
    let fixture = setup();
    let market_id = market(&fixture, 0, 60);
    let alice = Address::generate(&fixture.e);
    fund(&fixture, &alice, 100);
    fixture.client.stake(&alice, &market_id, &0, &100);

    assert!(fixture
        .client
        .try_propose_resolution(&market_id, &0, &result_hash(&fixture.e, 1))
        .is_err());
}

#[test]
fn resolution_requires_review_delay() {
    let fixture = setup();
    let market_id = market(&fixture, 0, 60);
    let alice = Address::generate(&fixture.e);
    fund(&fixture, &alice, 100);
    fixture.client.stake(&alice, &market_id, &0, &100);

    fixture.e.ledger().set_timestamp(2_000);
    let hash = result_hash(&fixture.e, 4);
    fixture.client.propose_resolution(&market_id, &0, &hash);
    assert!(fixture.client.try_finalize_resolution(&market_id).is_err());

    fixture.e.ledger().set_timestamp(2_060);
    fixture.client.finalize_resolution(&market_id);
    let stored = fixture.client.market(&market_id);
    assert_eq!(stored.status, RESOLVED);
    assert_eq!(stored.result_hash, hash);
}

#[test]
fn fee_is_charged_only_on_profit() {
    let fixture = setup();
    let market_id = market(&fixture, 200, 0);
    let alice = Address::generate(&fixture.e);
    let bob = Address::generate(&fixture.e);
    fund(&fixture, &alice, 1_000);
    fund(&fixture, &bob, 1_000);

    fixture.client.stake(&alice, &market_id, &0, &100);
    fixture.client.stake(&bob, &market_id, &1, &100);
    resolve(&fixture, market_id, 0, 0);

    // Gross payout is 200. Returned principal is 100; only the 100 profit is charged 2%.
    assert_eq!(fixture.client.claim(&alice, &market_id), 198);
    assert_eq!(fixture.token.balance(&fixture.treasury), 2);
    assert_eq!(fixture.token.balance(&alice), 1_098);
}

#[test]
fn final_claimant_receives_rounding_remainder() {
    let fixture = setup();
    let market_id = market(&fixture, 0, 0);
    let alice = Address::generate(&fixture.e);
    let bob = Address::generate(&fixture.e);
    let loser = Address::generate(&fixture.e);
    for user in [&alice, &bob, &loser] {
        fund(&fixture, user, 1_000);
    }

    fixture.client.stake(&alice, &market_id, &0, &1);
    fixture.client.stake(&bob, &market_id, &0, &2);
    fixture.client.stake(&loser, &market_id, &1, &1);
    resolve(&fixture, market_id, 0, 0);

    let alice_net = fixture.client.claim(&alice, &market_id);
    let bob_net = fixture.client.claim(&bob, &market_id);
    assert_eq!(alice_net + bob_net, 4);
    assert_eq!(fixture.token.balance(&fixture.client.address), 0);
}

#[test]
fn cancellation_refunds_every_option_once() {
    let fixture = setup();
    let market_id = market(&fixture, 500, 0);
    let alice = Address::generate(&fixture.e);
    fund(&fixture, &alice, 1_000);
    fixture.client.stake(&alice, &market_id, &0, &100);
    fixture.client.stake(&alice, &market_id, &1, &50);

    fixture.client.cancel_market(&market_id);
    assert_eq!(fixture.client.refund(&alice, &market_id), 150);
    assert_eq!(fixture.token.balance(&alice), 1_000);
    assert!(fixture.client.try_refund(&alice, &market_id).is_err());
}

#[test]
fn pause_blocks_new_stakes_but_not_exit() {
    let fixture = setup();
    let market_id = market(&fixture, 0, 0);
    let alice = Address::generate(&fixture.e);
    fund(&fixture, &alice, 1_000);
    fixture.client.stake(&alice, &market_id, &0, &100);

    fixture.client.pause_staking();
    assert!(fixture
        .client
        .try_stake(&alice, &market_id, &0, &10)
        .is_err());
    assert_eq!(fixture.client.unstake(&alice, &market_id, &0), 100);
}

#[test]
fn no_stake_or_unstake_after_close_time() {
    let fixture = setup();
    let market_id = market(&fixture, 0, 0);
    let alice = Address::generate(&fixture.e);
    fund(&fixture, &alice, 1_000);
    fixture.client.stake(&alice, &market_id, &0, &100);
    fixture.e.ledger().set_timestamp(2_000);

    assert!(fixture
        .client
        .try_stake(&alice, &market_id, &0, &10)
        .is_err());
    assert!(fixture.client.try_unstake(&alice, &market_id, &0).is_err());
}

#[test]
fn cannot_select_an_unbacked_winner() {
    let fixture = setup();
    let market_id = market(&fixture, 0, 0);
    let alice = Address::generate(&fixture.e);
    fund(&fixture, &alice, 100);
    fixture.client.stake(&alice, &market_id, &0, &100);
    fixture.e.ledger().set_timestamp(2_000);

    assert!(fixture
        .client
        .try_propose_resolution(&market_id, &1, &result_hash(&fixture.e, 8))
        .is_err());
}

#[test]
fn fee_and_resolver_are_snapshotted_per_market() {
    let fixture = setup();
    let market_id = market(&fixture, 321, 75);
    let stored = fixture.client.market(&market_id);
    assert_eq!(stored.fee_bps, 321);
    assert_eq!(stored.resolution_delay, 75);
    assert_eq!(stored.resolver, fixture.resolver);
    assert_eq!(stored.treasury, fixture.treasury);
    let _ = fixture.admin;
}
