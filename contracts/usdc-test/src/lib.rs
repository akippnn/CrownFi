#![no_std]
// UsdcTest: a mintable SEP-41 fungible token that stands in for USDC on Testnet.
//
// Why a Soroban token (not a wrapped classic asset): a native Soroban token needs NO trustlines, so
// we can mint balances to any demo wallet instantly and the sale-splitter can move it with the plain
// token `transfer` interface. On mainnet you'd simply point the sale-splitter at Circle's real USDC
// Stellar Asset Contract instead of this — no other change.
//
// Security: mint() is #[only_owner] so only the platform can fund test wallets. 7 decimals to match
// USDC on Stellar (so 1 USDC = 10_000_000 base units).

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use stellar_tokens::fungible::{Base, FungibleToken};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::{default_impl, only_owner};

#[contract]
pub struct UsdcTest;

#[contractimpl]
impl UsdcTest {
    pub fn __constructor(e: &Env, owner: Address) {
        Base::set_metadata(
            e,
            7,
            String::from_str(e, "USD Coin (Testnet)"),
            String::from_str(e, "USDC"),
        );
        ownable::set_owner(e, &owner);
    }

    // Owner-gated faucet: mint test USDC to a wallet so it can buy collectibles.
    #[only_owner]
    pub fn mint(e: &Env, to: Address, amount: i128) {
        Base::mint(e, &to, amount);
    }
}

#[default_impl]
#[contractimpl]
impl FungibleToken for UsdcTest {
    type ContractType = Base;
}

#[default_impl]
#[contractimpl]
impl Ownable for UsdcTest {}
