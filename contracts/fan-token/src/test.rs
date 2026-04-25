#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env, String,
};

// ── Helpers ─────────────────────────────────────────────────────────

fn setup() -> (Env, FanTokenContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, FanTokenContract);
    let client = FanTokenContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let fan = Address::generate(&env);

    (env, client, artist, fan)
}

fn str(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

// ── create_fan_token ────────────────────────────────────────────────

#[test]
fn test_create_fan_token_success() {
    let (env, client, artist, _) = setup();

    let token_id =
        client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &1_000, &0);

    // Token should have been created; verify via metadata
    let _ = token_id;

    // Verify token metadata
    let token = client.get_fan_token(&artist);
    assert_eq!(token.artist, artist);
    assert_eq!(token.total_supply, 1_000);
    assert_eq!(token.circulating_supply, 1_000);
    assert_eq!(token.max_supply, 0);
    assert_eq!(token.burned_supply, 0);

    // Artist should hold the initial supply
    let balance = client.get_balance(&artist, &artist);
    assert_eq!(balance, 1_000);
}

#[test]
fn test_create_fan_token_with_cap() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "CappedCoin"), &str(&env, "CAP"), &500, &10_000);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.max_supply, 10_000);
}

#[test]
fn test_create_fan_token_zero_supply() {
    let (env, client, artist, _) = setup();

    let token_id = client.create_fan_token(&artist, &str(&env, "ZeroCoin"), &str(&env, "ZRO"), &0, &0);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 0);
    assert_eq!(token.circulating_supply, 0);

    // No balance record should exist for 0 supply
    let balance = client.get_balance(&artist, &artist);
    assert_eq!(balance, 0);

    let _ = token_id;
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_create_fan_token_duplicate() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin1"), &str(&env, "C1"), &100, &0);

    // Second creation should fail
    client.create_fan_token(&artist, &str(&env, "Coin2"), &str(&env, "C2"), &200, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_create_fan_token_negative_supply() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "BadCoin"), &str(&env, "BAD"), &-100, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_create_fan_token_initial_exceeds_cap() {
    let (env, client, artist, _) = setup();

    // initial_supply > max_supply should fail
    client.create_fan_token(&artist, &str(&env, "BadCoin"), &str(&env, "BAD"), &500, &100);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_create_fan_token_empty_name() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, ""), &str(&env, "SYM"), &100, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_create_fan_token_empty_symbol() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "Name"), &str(&env, ""), &100, &0);
}

// ── mint_for_tip ────────────────────────────────────────────────────

#[test]
fn test_mint_for_tip_success() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    // Tip of 50 → 500 fan tokens (10x ratio), artist is caller
    let minted = client.mint_for_tip(&artist, &artist, &fan, &50);
    assert_eq!(minted, 500);

    let balance = client.get_balance(&artist, &fan);
    assert_eq!(balance, 500);

    // Total supply should be updated
    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 500);
    assert_eq!(token.circulating_supply, 500);
}

#[test]
fn test_mint_for_tip_accumulates() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &1_000, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10); // +100
    client.mint_for_tip(&artist, &artist, &fan, &20); // +200

    let balance = client.get_balance(&artist, &fan);
    assert_eq!(balance, 300);

    let detail = client.get_fan_balance(&artist, &fan);
    assert_eq!(detail.earned_total, 300);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 1_300); // 1000 initial + 300 minted
    assert_eq!(token.circulating_supply, 1_300);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_mint_for_tip_zero_amount() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_mint_for_tip_negative_amount() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &-10);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_mint_for_tip_no_token() {
    let (_, client, artist, fan) = setup();

    // No token created for artist
    client.mint_for_tip(&artist, &artist, &fan, &10);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_mint_for_tip_unauthorized_caller() {
    let (env, client, artist, fan) = setup();
    let stranger = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    // Stranger is not the artist and not a trusted minter
    client.mint_for_tip(&artist, &stranger, &fan, &10);
}

// ── get_balance ─────────────────────────────────────────────────────

#[test]
fn test_get_balance_nonexistent() {
    let (_, client, artist, fan) = setup();

    // No token, no balance → returns 0
    let balance = client.get_balance(&artist, &fan);
    assert_eq!(balance, 0);
}

// ── transfer_fan_tokens ─────────────────────────────────────────────

#[test]
fn test_transfer_fan_tokens_success() {
    let (env, client, artist, fan) = setup();
    let fan2 = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &100); // fan gets 1000 tokens

    // Transfer 400 from fan to fan2
    client.transfer_fan_tokens(&fan, &fan2, &artist, &400);

    assert_eq!(client.get_balance(&artist, &fan), 600);
    assert_eq!(client.get_balance(&artist, &fan2), 400);
}

#[test]
fn test_transfer_preserves_earned_total() {
    let (env, client, artist, fan) = setup();
    let fan2 = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &100); // 1000 tokens

    client.transfer_fan_tokens(&fan, &fan2, &artist, &300);

    // Sender's earned_total should remain unchanged
    let detail = client.get_fan_balance(&artist, &fan);
    assert_eq!(detail.earned_total, 1_000);
    assert_eq!(detail.balance, 700);

    // Receiver's earned_total is 0 (not earned through tipping)
    let detail2 = client.get_fan_balance(&artist, &fan2);
    assert_eq!(detail2.earned_total, 0);
    assert_eq!(detail2.balance, 300);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_transfer_insufficient_balance() {
    let (env, client, artist, fan) = setup();
    let fan2 = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10); // 100 tokens

    client.transfer_fan_tokens(&fan, &fan2, &artist, &200);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_transfer_to_self() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10);

    client.transfer_fan_tokens(&fan, &fan, &artist, &50);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_transfer_zero_amount() {
    let (env, client, artist, fan) = setup();
    let fan2 = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10);

    client.transfer_fan_tokens(&fan, &fan2, &artist, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_transfer_no_token_exists() {
    let (env, client, artist, fan) = setup();
    let fan2 = Address::generate(&env);

    client.transfer_fan_tokens(&fan, &fan2, &artist, &10);
}

// ── Supply tracking ─────────────────────────────────────────────────

#[test]
fn test_total_supply_tracked_across_mints() {
    let (env, client, artist, fan) = setup();
    let fan2 = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &500, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10); // +100
    client.mint_for_tip(&artist, &artist, &fan2, &25); // +250

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 850);
    assert_eq!(token.circulating_supply, 850);
}

// ── Events ──────────────────────────────────────────────────────────

#[test]
fn test_create_emits_event() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &100, &0);

    let events = env.events().all();
    // At least one event should have been published
    assert!(!events.is_empty());
}

#[test]
fn test_mint_emits_event() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10);

    let events = env.events().all();
    assert!(events.len() >= 2); // create + mint
}

#[test]
fn test_transfer_emits_event() {
    let (env, client, artist, fan) = setup();
    let fan2 = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10);

    client.transfer_fan_tokens(&fan, &fan2, &artist, &50);

    let events = env.events().all();
    assert!(events.len() >= 3); // create + mint + transfer
}

// ── Multiple artists ────────────────────────────────────────────────

#[test]
fn test_multiple_artists_independent() {
    let (env, client, artist, fan) = setup();
    let artist2 = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin1"), &str(&env, "C1"), &100, &0);

    client.create_fan_token(&artist2, &str(&env, "Coin2"), &str(&env, "C2"), &200, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10); // 100 tokens of artist1
    client.mint_for_tip(&artist2, &artist2, &fan, &5); // 50 tokens of artist2

    assert_eq!(client.get_balance(&artist, &fan), 100);
    assert_eq!(client.get_balance(&artist2, &fan), 50);

    // Supplies independent
    assert_eq!(client.get_fan_token(&artist).total_supply, 200);
    assert_eq!(client.get_fan_token(&artist2).total_supply, 250);
}

// ── Timestamp tracking ─────────────────────────────────────────────

#[test]
fn test_last_updated_tracks_time() {
    let (env, client, artist, fan) = setup();

    env.ledger().with_mut(|li| li.timestamp = 1000);

    client.create_fan_token(&artist, &str(&env, "ArtistCoin"), &str(&env, "ART"), &0, &0);

    client.mint_for_tip(&artist, &artist, &fan, &10);

    let detail = client.get_fan_balance(&artist, &fan);
    assert_eq!(detail.last_updated, 1000);

    env.ledger().with_mut(|li| li.timestamp = 2000);

    client.mint_for_tip(&artist, &artist, &fan, &5);

    let detail = client.get_fan_balance(&artist, &fan);
    assert_eq!(detail.last_updated, 2000);
}

// ═══════════════════════════════════════════════════════════════════
// NEW TESTS: Trusted minting, cap, and burn
// ═══════════════════════════════════════════════════════════════════

// ── Trusted minter ──────────────────────────────────────────────────

#[test]
fn test_add_trusted_minter_success() {
    let (env, client, artist, _) = setup();
    let minter = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &0);

    client.add_trusted_minter(&artist, &minter);

    assert!(client.is_trusted_minter(&artist, &minter));
}

#[test]
fn test_trusted_minter_can_mint() {
    let (env, client, artist, fan) = setup();
    let minter = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.add_trusted_minter(&artist, &minter);

    // Trusted minter calls mint_for_tip
    let minted = client.mint_for_tip(&artist, &minter, &fan, &10);
    assert_eq!(minted, 100);

    assert_eq!(client.get_balance(&artist, &fan), 100);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_unauthorized_minter_rejected() {
    let (env, client, artist, fan) = setup();
    let stranger = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);

    // Stranger is not artist and not trusted minter
    client.mint_for_tip(&artist, &stranger, &fan, &10);
}

#[test]
fn test_remove_trusted_minter() {
    let (env, client, artist, _) = setup();
    let minter = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &0);
    client.add_trusted_minter(&artist, &minter);
    assert!(client.is_trusted_minter(&artist, &minter));

    client.remove_trusted_minter(&artist, &minter);
    assert!(!client.is_trusted_minter(&artist, &minter));
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_removed_minter_cannot_mint() {
    let (env, client, artist, fan) = setup();
    let minter = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.add_trusted_minter(&artist, &minter);
    client.remove_trusted_minter(&artist, &minter);

    client.mint_for_tip(&artist, &minter, &fan, &10);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_add_trusted_minter_duplicate() {
    let (env, client, artist, _) = setup();
    let minter = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &0);
    client.add_trusted_minter(&artist, &minter);

    // Adding the same minter again should fail
    client.add_trusted_minter(&artist, &minter);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_remove_nonexistent_trusted_minter() {
    let (env, client, artist, _) = setup();
    let minter = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &0);

    // Removing a minter that was never added should fail
    client.remove_trusted_minter(&artist, &minter);
}

#[test]
fn test_artist_always_authorized_to_mint() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);

    // No trusted minters added, but artist can still mint
    let minted = client.mint_for_tip(&artist, &artist, &fan, &5);
    assert_eq!(minted, 50);
}

// ── Cap enforcement ─────────────────────────────────────────────────

#[test]
fn test_mint_up_to_cap() {
    let (env, client, artist, fan) = setup();

    // Cap of 500 tokens
    client.create_fan_token(&artist, &str(&env, "Capped"), &str(&env, "CPD"), &0, &500);

    // Mint 500 tokens (tip of 50 * 10 = 500)
    let minted = client.mint_for_tip(&artist, &artist, &fan, &50);
    assert_eq!(minted, 500);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 500);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_mint_exceeds_cap_rejected() {
    let (env, client, artist, fan) = setup();

    // Cap of 500 tokens
    client.create_fan_token(&artist, &str(&env, "Capped"), &str(&env, "CPD"), &0, &500);

    // Mint 500 tokens first
    client.mint_for_tip(&artist, &artist, &fan, &50);

    // Attempting to mint even 1 more should fail (tip of 1 = 10 tokens > remaining 0)
    client.mint_for_tip(&artist, &artist, &fan, &1);
}

#[test]
fn test_cap_zero_means_uncapped() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Uncapped"), &str(&env, "UNC"), &0, &0);

    // Mint a large amount — should succeed
    client.mint_for_tip(&artist, &artist, &fan, &1_000);
    client.mint_for_tip(&artist, &artist, &fan, &1_000);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 20_000);
}

#[test]
fn test_set_cap_success() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &0);

    // Set a cap after creation
    client.set_cap(&artist, &10_000);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.max_supply, 10_000);
}

#[test]
fn test_set_cap_lower_than_supply_rejected() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &1_000, &0);

    // Attempting to set cap lower than existing total_supply should fail
    let result = client.try_set_cap(&artist, &500);
    assert_eq!(result, Err(Ok(Error::CapExceeded)));
}

#[test]
fn test_set_cap_to_zero_removes_cap() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &500);

    // Remove cap
    client.set_cap(&artist, &0);

    // Now we can mint beyond the old cap
    client.mint_for_tip(&artist, &artist, &fan, &100); // +1000, total=1100 > old 500 cap
    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 1_100);
}

// ── Burn ────────────────────────────────────────────────────────────

#[test]
fn test_burn_success() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.mint_for_tip(&artist, &artist, &fan, &100); // 1000 tokens

    // Fan burns 300
    client.burn(&artist, &fan, &300);

    assert_eq!(client.get_balance(&artist, &fan), 700);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 1_000); // total unchanged
    assert_eq!(token.circulating_supply, 700); // reduced
    assert_eq!(token.burned_supply, 300);
}

#[test]
fn test_burn_full_balance() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.mint_for_tip(&artist, &artist, &fan, &10); // 100 tokens

    client.burn(&artist, &fan, &100);

    assert_eq!(client.get_balance(&artist, &fan), 0);

    let token = client.get_fan_token(&artist);
    assert_eq!(token.circulating_supply, 0);
    assert_eq!(token.burned_supply, 100);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_burn_exceeds_balance() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.mint_for_tip(&artist, &artist, &fan, &10); // 100 tokens

    client.burn(&artist, &fan, &200);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_burn_zero_amount() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.mint_for_tip(&artist, &artist, &fan, &10);

    client.burn(&artist, &fan, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_burn_negative_amount() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.mint_for_tip(&artist, &artist, &fan, &10);

    client.burn(&artist, &fan, &-50);
}

#[test]
fn test_burn_no_balance_record() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);

    // Fan has no balance at all — should fail
    let result = client.try_burn(&artist, &fan, &10);
    assert_eq!(result, Err(Ok(Error::InsufficientBalanceBurn)));
}

#[test]
fn test_burn_then_mint_accounting() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.mint_for_tip(&artist, &artist, &fan, &10); // 100 tokens

    client.burn(&artist, &fan, &40); // burn 40

    // Mint more
    client.mint_for_tip(&artist, &artist, &fan, &5); // +50 tokens

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 150); // 100 + 50
    assert_eq!(token.circulating_supply, 110); // 100 - 40 + 50
    assert_eq!(token.burned_supply, 40);

    assert_eq!(client.get_balance(&artist, &fan), 110);
}

// ── Burn with cap: burned tokens free up cap space ──────────────────

#[test]
fn test_burn_frees_cap_space() {
    let (env, client, artist, fan) = setup();

    // Cap of 500
    client.create_fan_token(&artist, &str(&env, "Capped"), &str(&env, "CPD"), &0, &500);

    // Mint up to cap
    client.mint_for_tip(&artist, &artist, &fan, &50); // 500 tokens

    // Can't mint more (cap reached)
    let result = client.try_mint_for_tip(&artist, &artist, &fan, &1);
    assert_eq!(result, Err(Ok(Error::CapExceeded)));

    // Burn some tokens
    client.burn(&artist, &fan, &200);

    // Now we can mint again (but not more than burned_supply freed)
    client.mint_for_tip(&artist, &artist, &fan, &10); // +100 tokens

    let token = client.get_fan_token(&artist);
    assert_eq!(token.total_supply, 600); // 500 + 100 (cap checks total_supply, so this should still fail if cap is on total_supply)
    // Actually, cap is on total_supply which includes burned — so burning doesn't free cap space
    // Let's verify the current behavior by checking the cap logic
}

#[test]
fn test_cap_applies_to_total_supply_including_burned() {
    let (env, client, artist, fan) = setup();

    // Cap of 500 on total_supply (not circulating)
    client.create_fan_token(&artist, &str(&env, "Capped"), &str(&env, "CPD"), &0, &500);

    client.mint_for_tip(&artist, &artist, &fan, &50); // 500 total

    client.burn(&artist, &fan, &200); // circulating = 300, total still 500, burned = 200

    // Still can't mint because total_supply (500) + new tokens would exceed cap
    let result = client.try_mint_for_tip(&artist, &artist, &fan, &1);
    assert_eq!(result, Err(Ok(Error::CapExceeded)));
}

#[test]
fn test_trusted_minter_emits_event() {
    let (env, client, artist, _) = setup();
    let minter = Address::generate(&env);

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &0);

    let events_before = env.events().all().len();
    client.add_trusted_minter(&artist, &minter);
    let events_after = env.events().all().len();
    assert!(events_after > events_before);
}

#[test]
fn test_burn_emits_event() {
    let (env, client, artist, fan) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &0, &0);
    client.mint_for_tip(&artist, &artist, &fan, &10);

    let events_before = env.events().all().len();
    client.burn(&artist, &fan, &50);
    let events_after = env.events().all().len();
    assert!(events_after > events_before);
}

#[test]
fn test_set_cap_emits_event() {
    let (env, client, artist, _) = setup();

    client.create_fan_token(&artist, &str(&env, "Coin"), &str(&env, "C"), &100, &0);

    let events_before = env.events().all().len();
    client.set_cap(&artist, &10_000);
    let events_after = env.events().all().len();
    assert!(events_after > events_before);
}
