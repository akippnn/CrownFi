#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env, String,
};

const OPEN: u32 = 0;
const RESOLUTION_PENDING: u32 = 1;
const RESOLVED: u32 = 2;
const CANCELLED: u32 = 3;
const BPS_DENOMINATOR: i128 = 10_000;
const MAX_FEE_BPS: u32 = 1_000;
const MAX_OPTIONS: u32 = 32;
const INSTANCE_TTL_THRESHOLD: u32 = 50_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 100_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 50_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 100_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Paused = 3,
    MarketNotFound = 4,
    InvalidOption = 5,
    InvalidAmount = 6,
    MarketClosed = 7,
    MarketStillOpen = 8,
    InvalidStatus = 9,
    AlreadyClaimed = 10,
    NothingToClaim = 11,
    NotCancelled = 12,
    InvalidParams = 13,
    NoWinningStake = 14,
    NothingToUnstake = 15,
    ResolutionDelayActive = 16,
    Arithmetic = 17,
}

#[contracttype]
#[derive(Clone)]
pub struct MarketInfo {
    pub question: String,
    pub category: String,
    pub num_options: u32,
    pub close_time: u64,
    pub resolution_delay: u64,
    pub fee_bps: u32,
    pub resolver: Address,
    pub treasury: Address,
    pub status: u32,
    pub winning_option: u32,
    pub result_hash: BytesN<32>,
    pub proposed_at: u64,
    pub total_pool: i128,
    pub claimed_gross: i128,
    pub claimed_winning_stake: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Token,
    Paused,
    MarketCount,
    Market(u32),
    Pool(u32, u32),
    Position(u32, Address, u32),
    Claimed(u32, Address),
}

fn bump_instance(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

fn bump_persistent(e: &Env, key: &DataKey) {
    e.storage().persistent().extend_ttl(
        key,
        PERSISTENT_TTL_THRESHOLD,
        PERSISTENT_TTL_EXTEND_TO,
    );
}

fn read_admin(e: &Env) -> Address {
    e.storage()
        .instance()
        .get::<_, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(e, Error::NotInitialized))
}

fn require_admin(e: &Env) {
    read_admin(e).require_auth();
}

fn token_client(e: &Env) -> token::Client<'_> {
    let token_address = e
        .storage()
        .instance()
        .get::<_, Address>(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(e, Error::NotInitialized));
    token::Client::new(e, &token_address)
}

fn is_paused(e: &Env) -> bool {
    e.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

fn read_market(e: &Env, market_id: u32) -> MarketInfo {
    let key = DataKey::Market(market_id);
    let market = e
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(e, Error::MarketNotFound));
    bump_persistent(e, &key);
    market
}

fn write_market(e: &Env, market_id: u32, market: &MarketInfo) {
    let key = DataKey::Market(market_id);
    e.storage().persistent().set(&key, market);
    bump_persistent(e, &key);
}

fn read_pool(e: &Env, market_id: u32, option: u32) -> i128 {
    let key = DataKey::Pool(market_id, option);
    let value = e.storage().persistent().get(&key).unwrap_or(0);
    if e.storage().persistent().has(&key) {
        bump_persistent(e, &key);
    }
    value
}

fn write_pool(e: &Env, market_id: u32, option: u32, amount: i128) {
    let key = DataKey::Pool(market_id, option);
    e.storage().persistent().set(&key, &amount);
    bump_persistent(e, &key);
}

fn read_position(e: &Env, market_id: u32, user: &Address, option: u32) -> i128 {
    let key = DataKey::Position(market_id, user.clone(), option);
    let value = e.storage().persistent().get(&key).unwrap_or(0);
    if e.storage().persistent().has(&key) {
        bump_persistent(e, &key);
    }
    value
}

fn write_position(e: &Env, market_id: u32, user: &Address, option: u32, amount: i128) {
    let key = DataKey::Position(market_id, user.clone(), option);
    e.storage().persistent().set(&key, &amount);
    bump_persistent(e, &key);
}

fn read_claimed(e: &Env, market_id: u32, user: &Address) -> bool {
    let key = DataKey::Claimed(market_id, user.clone());
    let value = e.storage().persistent().get(&key).unwrap_or(false);
    if e.storage().persistent().has(&key) {
        bump_persistent(e, &key);
    }
    value
}

fn write_claimed(e: &Env, market_id: u32, user: &Address) {
    let key = DataKey::Claimed(market_id, user.clone());
    e.storage().persistent().set(&key, &true);
    bump_persistent(e, &key);
}

fn checked_add(e: &Env, left: i128, right: i128) -> i128 {
    left.checked_add(right)
        .unwrap_or_else(|| panic_with_error!(e, Error::Arithmetic))
}

fn checked_sub(e: &Env, left: i128, right: i128) -> i128 {
    left.checked_sub(right)
        .unwrap_or_else(|| panic_with_error!(e, Error::Arithmetic))
}

fn checked_mul(e: &Env, left: i128, right: i128) -> i128 {
    left.checked_mul(right)
        .unwrap_or_else(|| panic_with_error!(e, Error::Arithmetic))
}

#[contract]
pub struct PredictionMarket;

#[contractimpl]
impl PredictionMarket {
    pub fn initialize(e: Env, admin: Address, token: Address) {
        if e.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&e, Error::AlreadyInitialized);
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Token, &token);
        e.storage().instance().set(&DataKey::Paused, &false);
        e.storage().instance().set(&DataKey::MarketCount, &0u32);
        bump_instance(&e);
        e.events().publish((symbol_short!("init"),), admin);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_market(
        e: Env,
        question: String,
        category: String,
        num_options: u32,
        close_time: u64,
        resolution_delay: u64,
        fee_bps: u32,
        resolver: Address,
        treasury: Address,
    ) -> u32 {
        require_admin(&e);
        if num_options < 2
            || num_options > MAX_OPTIONS
            || close_time <= e.ledger().timestamp()
            || fee_bps > MAX_FEE_BPS
        {
            panic_with_error!(&e, Error::InvalidParams);
        }

        let market_id = e
            .storage()
            .instance()
            .get::<_, u32>(&DataKey::MarketCount)
            .unwrap_or(0)
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&e, Error::Arithmetic));

        let market = MarketInfo {
            question,
            category,
            num_options,
            close_time,
            resolution_delay,
            fee_bps,
            resolver,
            treasury,
            status: OPEN,
            winning_option: 0,
            result_hash: BytesN::from_array(&e, &[0; 32]),
            proposed_at: 0,
            total_pool: 0,
            claimed_gross: 0,
            claimed_winning_stake: 0,
        };

        write_market(&e, market_id, &market);
        e.storage()
            .instance()
            .set(&DataKey::MarketCount, &market_id);
        bump_instance(&e);
        e.events()
            .publish((symbol_short!("create"), market_id), num_options);
        market_id
    }

    pub fn stake(e: Env, from: Address, market_id: u32, option: u32, amount: i128) {
        from.require_auth();
        if is_paused(&e) {
            panic_with_error!(&e, Error::Paused);
        }
        if amount <= 0 {
            panic_with_error!(&e, Error::InvalidAmount);
        }

        let mut market = read_market(&e, market_id);
        if market.status != OPEN || e.ledger().timestamp() >= market.close_time {
            panic_with_error!(&e, Error::MarketClosed);
        }
        if option >= market.num_options {
            panic_with_error!(&e, Error::InvalidOption);
        }

        token_client(&e).transfer(&from, &e.current_contract_address(), &amount);

        let option_pool = checked_add(&e, read_pool(&e, market_id, option), amount);
        let position = checked_add(
            &e,
            read_position(&e, market_id, &from, option),
            amount,
        );
        market.total_pool = checked_add(&e, market.total_pool, amount);

        write_pool(&e, market_id, option, option_pool);
        write_position(&e, market_id, &from, option, position);
        write_market(&e, market_id, &market);
        bump_instance(&e);
        e.events()
            .publish((symbol_short!("stake"), market_id, from), (option, amount));
    }

    pub fn unstake(e: Env, from: Address, market_id: u32, option: u32) -> i128 {
        from.require_auth();
        let mut market = read_market(&e, market_id);
        if market.status != OPEN || e.ledger().timestamp() >= market.close_time {
            panic_with_error!(&e, Error::MarketClosed);
        }
        if option >= market.num_options {
            panic_with_error!(&e, Error::InvalidOption);
        }

        let position = read_position(&e, market_id, &from, option);
        if position <= 0 {
            panic_with_error!(&e, Error::NothingToUnstake);
        }

        let option_pool = checked_sub(&e, read_pool(&e, market_id, option), position);
        market.total_pool = checked_sub(&e, market.total_pool, position);
        write_pool(&e, market_id, option, option_pool);
        write_position(&e, market_id, &from, option, 0);
        write_market(&e, market_id, &market);
        token_client(&e).transfer(&e.current_contract_address(), &from, &position);
        bump_instance(&e);
        e.events().publish(
            (symbol_short!("unstake"), market_id, from),
            (option, position),
        );
        position
    }

    pub fn propose_resolution(
        e: Env,
        market_id: u32,
        winning_option: u32,
        result_hash: BytesN<32>,
    ) {
        let mut market = read_market(&e, market_id);
        market.resolver.require_auth();
        if market.status != OPEN {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if e.ledger().timestamp() < market.close_time {
            panic_with_error!(&e, Error::MarketStillOpen);
        }
        if winning_option >= market.num_options {
            panic_with_error!(&e, Error::InvalidOption);
        }
        if read_pool(&e, market_id, winning_option) <= 0 {
            panic_with_error!(&e, Error::NoWinningStake);
        }

        market.status = RESOLUTION_PENDING;
        market.winning_option = winning_option;
        market.result_hash = result_hash.clone();
        market.proposed_at = e.ledger().timestamp();
        write_market(&e, market_id, &market);
        bump_instance(&e);
        e.events().publish(
            (symbol_short!("proposal"), market_id),
            (winning_option, result_hash),
        );
    }

    pub fn finalize_resolution(e: Env, market_id: u32) {
        let mut market = read_market(&e, market_id);
        market.resolver.require_auth();
        if market.status != RESOLUTION_PENDING {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        let finalizable_at = market
            .proposed_at
            .checked_add(market.resolution_delay)
            .unwrap_or_else(|| panic_with_error!(&e, Error::Arithmetic));
        if e.ledger().timestamp() < finalizable_at {
            panic_with_error!(&e, Error::ResolutionDelayActive);
        }

        market.status = RESOLVED;
        write_market(&e, market_id, &market);
        bump_instance(&e);
        e.events().publish(
            (symbol_short!("finalize"), market_id),
            (market.winning_option, market.result_hash),
        );
    }

    pub fn cancel_market(e: Env, market_id: u32) {
        require_admin(&e);
        let mut market = read_market(&e, market_id);
        if market.status == RESOLVED || market.status == CANCELLED {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        market.status = CANCELLED;
        write_market(&e, market_id, &market);
        bump_instance(&e);
        e.events()
            .publish((symbol_short!("cancel"), market_id), true);
    }

    pub fn claim(e: Env, from: Address, market_id: u32) -> i128 {
        from.require_auth();
        let mut market = read_market(&e, market_id);
        if market.status != RESOLVED {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if read_claimed(&e, market_id, &from) {
            panic_with_error!(&e, Error::AlreadyClaimed);
        }

        let stake = read_position(&e, market_id, &from, market.winning_option);
        if stake <= 0 {
            panic_with_error!(&e, Error::NothingToClaim);
        }
        let winning_pool = read_pool(&e, market_id, market.winning_option);
        if winning_pool <= 0 {
            panic_with_error!(&e, Error::NoWinningStake);
        }

        let next_claimed_stake = checked_add(&e, market.claimed_winning_stake, stake);
        let gross = if next_claimed_stake == winning_pool {
            checked_sub(&e, market.total_pool, market.claimed_gross)
        } else {
            checked_mul(&e, stake, market.total_pool) / winning_pool
        };
        let profit = checked_sub(&e, gross, stake);
        let fee = checked_mul(&e, profit, market.fee_bps as i128) / BPS_DENOMINATOR;
        let net = checked_sub(&e, gross, fee);

        market.claimed_winning_stake = next_claimed_stake;
        market.claimed_gross = checked_add(&e, market.claimed_gross, gross);
        write_claimed(&e, market_id, &from);
        write_market(&e, market_id, &market);

        let token = token_client(&e);
        if fee > 0 {
            token.transfer(&e.current_contract_address(), &market.treasury, &fee);
        }
        token.transfer(&e.current_contract_address(), &from, &net);
        bump_instance(&e);
        e.events().publish(
            (symbol_short!("claim"), market_id, from),
            (gross, fee, net),
        );
        net
    }

    pub fn refund(e: Env, from: Address, market_id: u32) -> i128 {
        from.require_auth();
        let market = read_market(&e, market_id);
        if market.status != CANCELLED {
            panic_with_error!(&e, Error::NotCancelled);
        }
        if read_claimed(&e, market_id, &from) {
            panic_with_error!(&e, Error::AlreadyClaimed);
        }

        let mut total = 0i128;
        for option in 0..market.num_options {
            total = checked_add(
                &e,
                total,
                read_position(&e, market_id, &from, option),
            );
        }
        if total <= 0 {
            panic_with_error!(&e, Error::NothingToClaim);
        }

        write_claimed(&e, market_id, &from);
        token_client(&e).transfer(&e.current_contract_address(), &from, &total);
        bump_instance(&e);
        e.events()
            .publish((symbol_short!("refund"), market_id, from), total);
        total
    }

    pub fn pause_staking(e: Env) {
        require_admin(&e);
        e.storage().instance().set(&DataKey::Paused, &true);
        bump_instance(&e);
    }

    pub fn unpause_staking(e: Env) {
        require_admin(&e);
        e.storage().instance().set(&DataKey::Paused, &false);
        bump_instance(&e);
    }

    pub fn transfer_admin(e: Env, new_admin: Address) {
        require_admin(&e);
        e.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance(&e);
    }

    pub fn market(e: Env, market_id: u32) -> MarketInfo {
        read_market(&e, market_id)
    }

    pub fn pool_of(e: Env, market_id: u32, option: u32) -> i128 {
        read_pool(&e, market_id, option)
    }

    pub fn position_of(e: Env, market_id: u32, user: Address, option: u32) -> i128 {
        read_position(&e, market_id, &user, option)
    }

    pub fn has_claimed(e: Env, market_id: u32, user: Address) -> bool {
        read_claimed(&e, market_id, &user)
    }

    pub fn market_count(e: Env) -> u32 {
        bump_instance(&e);
        e.storage()
            .instance()
            .get(&DataKey::MarketCount)
            .unwrap_or(0)
    }

    pub fn paused(e: Env) -> bool {
        bump_instance(&e);
        is_paused(&e)
    }

    pub fn admin(e: Env) -> Address {
        bump_instance(&e);
        read_admin(&e)
    }
}

#[cfg(test)]
mod test;
