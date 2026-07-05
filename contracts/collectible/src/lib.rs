#![no_std]
// Collectible: contestant portrait NFTs with a royalty extension so the contestant earns on every
// secondary sale. Built on OpenZeppelin Stellar non-fungible + royalties.
//
// Security layers:
//  - #[only_owner] gates mint(), set_default_royalty(), set_paused().
//  - royalty basis points validated (<= 10000), so a royalty over 100% is impossible.
//  - pause switch + max_supply cap (0 = unlimited).
//  - mint event emitted.
//
// NOTE: references the OZ Stellar crates; generate the baseline from the OZ Contract Wizard and pin
// versions. The royalty API mirrors ERC-2981 (basis-point fees).

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};
use stellar_tokens::non_fungible::{royalties::NonFungibleRoyalties, Base, NonFungibleToken};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::{default_impl, only_owner};

const MAX_BPS: u32 = 10_000;

#[contracttype]
pub enum Cfg {
    Paused,
    MaxSupply,
    Minted,
}

#[contract]
pub struct Collectible;

#[contractimpl]
impl Collectible {
    // royalty_bps: creator fee in basis points (1000 = 10%). royalty_receiver is the contestant.
    pub fn __constructor(e: &Env, owner: Address, royalty_receiver: Address, royalty_bps: u32, max_supply: u32) {
        if royalty_bps > MAX_BPS {
            panic!("royalty bps out of range");
        }
        Base::set_metadata(
            e,
            String::from_str(e, "ipfs://crownfi/collectibles/"),
            String::from_str(e, "CrownFi Collectible"),
            String::from_str(e, "CFC"),
        );
        ownable::set_owner(e, &owner);
        e.storage().instance().set(&Cfg::Paused, &false);
        e.storage().instance().set(&Cfg::MaxSupply, &max_supply);
        e.storage().instance().set(&Cfg::Minted, &0u32);
        // Storage-level helper (no auth): valid to call from the constructor.
        Base::set_default_royalty(e, &royalty_receiver, royalty_bps);
    }

    #[only_owner]
    pub fn mint(e: &Env, to: Address) -> u32 {
        if e.storage().instance().get(&Cfg::Paused).unwrap_or(false) {
            panic!("minting paused");
        }
        let max: u32 = e.storage().instance().get(&Cfg::MaxSupply).unwrap_or(0);
        let minted: u32 = e.storage().instance().get(&Cfg::Minted).unwrap_or(0);
        if max != 0 && minted >= max {
            panic!("max supply reached");
        }
        let id = Base::sequential_mint(e, &to);
        e.storage().instance().set(&Cfg::Minted, &(minted + 1));
        e.events().publish((symbol_short!("mint"), to), id);
        id
    }

    #[only_owner]
    pub fn set_paused(e: &Env, paused: bool) {
        e.storage().instance().set(&Cfg::Paused, &paused);
    }
}

#[default_impl]
#[contractimpl]
impl NonFungibleToken for Collectible {
    type ContractType = Base;
}

// NonFungibleRoyalties is not supported by `#[default_impl]` (unlike NonFungibleToken/Ownable), so
// the four ERC-2981 methods are implemented explicitly, each delegating to the Base storage helper.
// The mutators are owner-gated via `enforce_owner_auth` (the security property this contract
// advertises); the `operator` arg is kept for interface compatibility with the trait. `royalty_info`
// is an open read used by marketplaces to compute the creator's cut on a secondary sale.
#[contractimpl]
impl NonFungibleRoyalties for Collectible {
    fn set_default_royalty(e: &Env, receiver: Address, basis_points: u32, _operator: Address) {
        ownable::enforce_owner_auth(e);
        Base::set_default_royalty(e, &receiver, basis_points);
    }

    fn set_token_royalty(e: &Env, token_id: u32, receiver: Address, basis_points: u32, _operator: Address) {
        ownable::enforce_owner_auth(e);
        Base::set_token_royalty(e, token_id, &receiver, basis_points);
    }

    fn remove_token_royalty(e: &Env, token_id: u32, _operator: Address) {
        ownable::enforce_owner_auth(e);
        Base::remove_token_royalty(e, token_id);
    }

    fn royalty_info(e: &Env, token_id: u32, sale_price: i128) -> (Address, i128) {
        Base::royalty_info(e, token_id, sale_price)
    }
}

#[default_impl]
#[contractimpl]
impl Ownable for Collectible {}
