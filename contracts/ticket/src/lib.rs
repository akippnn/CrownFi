#![no_std]
// Ticket: an NFT ticket built on the OpenZeppelin Stellar non-fungible token.
//
// Security layers:
//  - #[only_owner] gates mint(), set_resale_open(), set_paused() (organizer only).
//  - pause switch halts minting in an emergency.
//  - max_supply cap enforced on-chain (0 = unlimited).
//  - transfer is blocked until the organizer opens the resale window (anti-scalping / soulbound).
//  - a mint event is emitted for indexers.
//
// NOTE: references the OpenZeppelin Stellar Contracts crates. Generate the exact baseline from
// the OZ Contract Wizard (https://docs.openzeppelin.com/stellar-contracts) and pin versions in the
// workspace Cargo.toml. Trait/method names below follow the documented patterns and may need minor
// adjustment to your pinned crate version.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};
// NOTE: `ContractOverrides` is intentionally NOT imported here — the `#[default_impl]` macro on the
// `NonFungibleToken` impl injects its own `use stellar_tokens::non_fungible::ContractOverrides;`,
// and importing it a second time would be a duplicate-definition error.
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::{default_impl, only_owner};
use stellar_tokens::non_fungible::{Base, NonFungibleToken};

#[contracttype]
pub enum Cfg {
    ResaleOpen,
    Paused,
    MaxSupply,
    Minted,
}

#[contract]
pub struct Ticket;

#[contractimpl]
impl Ticket {
    // max_supply = 0 means unlimited.
    pub fn __constructor(e: &Env, owner: Address, max_supply: u32) {
        Base::set_metadata(
            e,
            String::from_str(e, "ipfs://crownfi/tickets/"),
            String::from_str(e, "CrownFi Ticket"),
            String::from_str(e, "CFT"),
        );
        ownable::set_owner(e, &owner);
        e.storage().instance().set(&Cfg::ResaleOpen, &false);
        e.storage().instance().set(&Cfg::Paused, &false);
        e.storage().instance().set(&Cfg::MaxSupply, &max_supply);
        e.storage().instance().set(&Cfg::Minted, &0u32);
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
    pub fn set_resale_open(e: &Env, open: bool) {
        e.storage().instance().set(&Cfg::ResaleOpen, &open);
    }

    #[only_owner]
    pub fn set_paused(e: &Env, paused: bool) {
        e.storage().instance().set(&Cfg::Paused, &paused);
    }

    pub fn resale_open(e: &Env) -> bool {
        e.storage()
            .instance()
            .get(&Cfg::ResaleOpen)
            .unwrap_or(false)
    }
}

// Enforce the resale policy: until the organizer opens resale, tickets are non-transferable
// (soulbound to the buyer), which blocks scalping on the secondary market. In stellar-tokens 0.4.1
// the way to customize transfer behavior is a ContractOverrides marker type, not a hand-written
// NonFungibleToken impl. We gate BOTH owner-initiated transfer() and approval-based transfer_from()
// so an approved third party cannot move the ticket while the window is closed either.
pub struct TicketOverrides;

impl ContractOverrides for TicketOverrides {
    fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        if !e
            .storage()
            .instance()
            .get(&Cfg::ResaleOpen)
            .unwrap_or(false)
        {
            panic!("resale window is closed");
        }
        Base::transfer(e, from, to, token_id);
    }

    fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        if !e
            .storage()
            .instance()
            .get(&Cfg::ResaleOpen)
            .unwrap_or(false)
        {
            panic!("resale window is closed");
        }
        Base::transfer_from(e, spender, from, to, token_id);
    }
}

#[default_impl]
#[contractimpl]
impl NonFungibleToken for Ticket {
    type ContractType = TicketOverrides;
}

#[default_impl]
#[contractimpl]
impl Ownable for Ticket {}
