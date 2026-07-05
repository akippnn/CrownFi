#![no_std]
// SaleSplitter: primary-sale settlement for collectibles.
//
// Security layers (this is the most safety-critical contract):
//  - Listing-based pricing. The admin registers a listing (price + contestant address) per item.
//    buy() reads price and payee FROM STORAGE, never from the caller. This closes the flaw where a
//    caller could set their own price or redirect proceeds to themselves.
//  - platform_bps validated (<= 10000) at construction; listing price validated (> 0).
//  - admin.require_auth() gates set_listing() and set_paused(); buyer.require_auth() gates buy().
//  - pause switch halts sales in an emergency.
//  - overflow-checks = true (workspace release profile) makes fee math panic on overflow.
//  - a "sale" event is emitted for indexers.
//
// USDC is referenced via the Stellar Asset Contract (SAC) token interface, so this contract stays
// dependency-light. The mint cross-call is left as a documented step to wire against the deployed
// Collectible contract id, so payment and mint become atomic.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env};

const MAX_BPS: u32 = 10_000;

#[contracttype]
pub enum DataKey {
    Admin,
    Usdc,          // SAC address of USDC
    Platform,      // platform treasury address
    PlatformBps,   // platform fee in basis points
    Paused,
    Listing(u32),  // listing_id -> Listing
}

#[contracttype]
#[derive(Clone)]
pub struct Listing {
    pub price: i128,
    pub contestant: Address,
    pub active: bool,
}

#[contract]
pub struct SaleSplitter;

#[contractimpl]
impl SaleSplitter {
    pub fn __constructor(e: Env, admin: Address, usdc: Address, platform: Address, platform_bps: u32) {
        if platform_bps > MAX_BPS {
            panic!("platform bps out of range");
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Usdc, &usdc);
        e.storage().instance().set(&DataKey::Platform, &platform);
        e.storage().instance().set(&DataKey::PlatformBps, &platform_bps);
        e.storage().instance().set(&DataKey::Paused, &false);
    }

    // Admin registers/updates a listing. Price and payee are trusted only when set here.
    pub fn set_listing(e: Env, listing_id: u32, price: i128, contestant: Address, active: bool) {
        Self::admin(e.clone()).require_auth();
        if price <= 0 {
            panic!("price must be positive");
        }
        e.storage().persistent().set(&DataKey::Listing(listing_id), &Listing { price, contestant, active });
    }

    pub fn set_paused(e: Env, paused: bool) {
        Self::admin(e.clone()).require_auth();
        e.storage().instance().set(&DataKey::Paused, &paused);
    }

    // Buyer pays the LISTED price. Split is computed from stored config; nothing is caller-supplied
    // except which listing to buy. Returns the amount routed to the contestant.
    pub fn buy(e: Env, buyer: Address, listing_id: u32) -> i128 {
        buyer.require_auth();

        if e.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
            panic!("sales paused");
        }

        let listing: Listing = e
            .storage()
            .persistent()
            .get(&DataKey::Listing(listing_id))
            .unwrap_or_else(|| panic!("no such listing"));
        if !listing.active {
            panic!("listing inactive");
        }

        let usdc: Address = e.storage().instance().get(&DataKey::Usdc).unwrap();
        let platform: Address = e.storage().instance().get(&DataKey::Platform).unwrap();
        let bps: u32 = e.storage().instance().get(&DataKey::PlatformBps).unwrap();

        let fee = listing.price * (bps as i128) / 10_000;
        let to_contestant = listing.price - fee;

        let client = token::Client::new(&e, &usdc);
        client.transfer(&buyer, &listing.contestant, &to_contestant);
        client.transfer(&buyer, &platform, &fee);

        // TODO(full build): cross-call Collectible.mint(buyer) via its contract id here, so payment
        // and mint happen atomically in one transaction.

        e.events().publish((symbol_short!("sale"), listing_id), (buyer, to_contestant));
        to_contestant
    }

    pub fn admin(e: Env) -> Address {
        e.storage().instance().get(&DataKey::Admin).unwrap()
    }
}

mod test;
