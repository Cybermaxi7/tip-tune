#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ── helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, TipVerificationContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, TipVerificationContract);
    let client = TipVerificationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client)
}

// ── original tests ────────────────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let (_, client) = setup();
    assert_eq!(client.get_tip_count(), 0);
}

#[test]
fn test_verify_tip() {
    let (env, client) = setup();
    let tx_hash = String::from_str(&env, "tx_abc123");
    assert_eq!(client.verify_tip(&tx_hash, &500), true);
    assert_eq!(client.is_verified(&tx_hash), true);
}

#[test]
fn test_prevents_double_spending() {
    let (env, client) = setup();
    let tx_hash = String::from_str(&env, "tx_double");
    assert_eq!(client.verify_tip(&tx_hash, &100), true);
    assert_eq!(
        client.try_verify_tip(&tx_hash, &100),
        Err(Ok(Error::AlreadyVerified))
    );
}

#[test]
fn test_record_verified_tip() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);
    let tip_id = String::from_str(&env, "tip_001");
    let tx_hash = String::from_str(&env, "tx_001");

    client.record_verified_tip(&tip_id, &tipper, &artist, &250, &tx_hash);

    let tip = client.get_tip(&tip_id);
    assert_eq!(tip.tipper, tipper);
    assert_eq!(tip.artist, artist);
    assert_eq!(tip.amount, 250);
    assert_eq!(tip.tx_hash, tx_hash);
    assert_eq!(tip.verified, true);
    assert_eq!(client.get_tip_count(), 1);
    assert_eq!(client.get_user_tip_count(&tipper), 1);
}

#[test]
fn test_records_immutable() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);
    let tip_id = String::from_str(&env, "tip_immutable");
    let tx_hash = String::from_str(&env, "tx_immutable");

    client.record_verified_tip(&tip_id, &tipper, &artist, &100, &tx_hash);

    // Same tip_id → DuplicateTipId
    let result = client.try_record_verified_tip(
        &tip_id,
        &tipper,
        &artist,
        &200,
        &String::from_str(&env, "tx_other"),
    );
    assert_eq!(result, Err(Ok(Error::DuplicateTipId)));

    // Original record unchanged
    assert_eq!(client.get_tip(&tip_id).amount, 100);
}

#[test]
fn test_invalid_amount_verify() {
    let (env, client) = setup();
    let tx_hash = String::from_str(&env, "tx_invalid");
    assert_eq!(
        client.try_verify_tip(&tx_hash, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_verify_tip(&tx_hash, &-50),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn test_invalid_amount_record() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);
    let tip_id = String::from_str(&env, "tip_invalid");
    let tx_hash = String::from_str(&env, "tx_invalid_amt");
    assert_eq!(
        client.try_record_verified_tip(&tip_id, &tipper, &artist, &0, &tx_hash),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn test_tip_not_found() {
    let (env, client) = setup();
    let tip_id = String::from_str(&env, "nonexistent");
    assert_eq!(
        client.try_get_tip(&tip_id),
        Err(Ok(Error::TipNotFound))
    );
}

#[test]
fn test_multiple_tips_counting() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist1 = Address::generate(&env);
    let artist2 = Address::generate(&env);

    client.record_verified_tip(
        &String::from_str(&env, "tip_a"),
        &tipper,
        &artist1,
        &100,
        &String::from_str(&env, "tx_a"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_b"),
        &tipper,
        &artist2,
        &200,
        &String::from_str(&env, "tx_b"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_c"),
        &tipper,
        &artist1,
        &300,
        &String::from_str(&env, "tx_c"),
    );

    assert_eq!(client.get_tip_count(), 3);
    assert_eq!(client.get_user_tip_count(&tipper), 3);
}

#[test]
fn test_unverified_tx_returns_false() {
    let (env, client) = setup();
    let unknown_tx = String::from_str(&env, "tx_unknown");
    assert_eq!(client.is_verified(&unknown_tx), false);
}

// ── secondary index tests ─────────────────────────────────────────────────────

#[test]
fn test_get_tip_by_tx_hash() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);
    let tip_id = String::from_str(&env, "tip_txhash_001");
    let tx_hash = String::from_str(&env, "tx_hash_abc123");

    client.record_verified_tip(&tip_id, &tipper, &artist, &500, &tx_hash);

    let tip = client.get_tip_by_tx_hash(&tx_hash);
    assert_eq!(tip.tip_id, tip_id);
    assert_eq!(tip.tipper, tipper);
    assert_eq!(tip.artist, artist);
    assert_eq!(tip.amount, 500);
    assert_eq!(tip.tx_hash, tx_hash);
}

#[test]
fn test_get_tip_by_tx_hash_not_found() {
    let (env, client) = setup();
    let unknown_tx = String::from_str(&env, "tx_nonexistent");
    assert_eq!(
        client.try_get_tip_by_tx_hash(&unknown_tx),
        Err(Ok(Error::TipNotFound))
    );
}

#[test]
fn test_get_artist_tip_count() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    client.record_verified_tip(
        &String::from_str(&env, "tip_art_1"),
        &tipper,
        &artist,
        &100,
        &String::from_str(&env, "tx_art_1"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_art_2"),
        &tipper,
        &artist,
        &200,
        &String::from_str(&env, "tx_art_2"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_art_3"),
        &tipper,
        &artist,
        &300,
        &String::from_str(&env, "tx_art_3"),
    );

    assert_eq!(client.get_artist_tip_count(&artist), 3);
}

#[test]
fn test_get_artist_tip_count_empty() {
    let (env, client) = setup();
    let artist = Address::generate(&env);
    assert_eq!(client.get_artist_tip_count(&artist), 0);
}

#[test]
fn test_get_tips_for_artist() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    client.record_verified_tip(
        &String::from_str(&env, "tip_list_1"),
        &tipper,
        &artist,
        &100,
        &String::from_str(&env, "tx_list_1"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_list_2"),
        &tipper,
        &artist,
        &200,
        &String::from_str(&env, "tx_list_2"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_list_3"),
        &tipper,
        &artist,
        &300,
        &String::from_str(&env, "tx_list_3"),
    );

    let tips = client.get_tips_for_artist(&artist);
    assert_eq!(tips.len(), 3);
    assert_eq!(tips.get(0).unwrap().amount, 100);
    assert_eq!(tips.get(1).unwrap().amount, 200);
    assert_eq!(tips.get(2).unwrap().amount, 300);
}

#[test]
fn test_get_tips_for_artist_empty() {
    let (env, client) = setup();
    let artist = Address::generate(&env);
    let tips = client.get_tips_for_artist(&artist);
    assert_eq!(tips.len(), 0);
}

#[test]
fn test_get_artist_tip_at_index() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    client.record_verified_tip(
        &String::from_str(&env, "tip_idx_0"),
        &tipper,
        &artist,
        &100,
        &String::from_str(&env, "tx_idx_0"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_idx_1"),
        &tipper,
        &artist,
        &200,
        &String::from_str(&env, "tx_idx_1"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_idx_2"),
        &tipper,
        &artist,
        &300,
        &String::from_str(&env, "tx_idx_2"),
    );

    assert_eq!(client.get_artist_tip_at_index(&artist, &0).amount, 100);
    assert_eq!(client.get_artist_tip_at_index(&artist, &1).amount, 200);
    assert_eq!(client.get_artist_tip_at_index(&artist, &2).amount, 300);
}

#[test]
fn test_get_artist_tip_at_index_invalid() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    client.record_verified_tip(
        &String::from_str(&env, "tip_valid"),
        &tipper,
        &artist,
        &100,
        &String::from_str(&env, "tx_valid"),
    );

    // Out-of-bounds index
    assert_eq!(
        client.try_get_artist_tip_at_index(&artist, &5),
        Err(Ok(Error::InvalidIndex))
    );
}

#[test]
fn test_duplicate_tx_hash_protection() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);
    let shared_tx_hash = String::from_str(&env, "tx_shared_hash");

    // First tip with this tx_hash succeeds
    client.record_verified_tip(
        &String::from_str(&env, "tip_dup_1"),
        &tipper,
        &artist,
        &100,
        &shared_tx_hash,
    );

    // Second tip with the same tx_hash must fail
    assert_eq!(
        client.try_record_verified_tip(
            &String::from_str(&env, "tip_dup_2"),
            &tipper,
            &artist,
            &200,
            &shared_tx_hash,
        ),
        Err(Ok(Error::DuplicateTxHash))
    );
}

#[test]
fn test_index_integrity_after_recording() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);
    let tip_id = String::from_str(&env, "tip_integrity");
    let tx_hash = String::from_str(&env, "tx_integrity");

    client.record_verified_tip(&tip_id, &tipper, &artist, &500, &tx_hash);

    // tx_hash lookup
    let tip_by_hash = client.get_tip_by_tx_hash(&tx_hash);
    assert_eq!(tip_by_hash.tip_id, tip_id);

    // artist index
    assert_eq!(client.get_artist_tip_count(&artist), 1);
    assert_eq!(client.get_artist_tip_at_index(&artist, &0).tip_id, tip_id);

    // artist list
    let tips = client.get_tips_for_artist(&artist);
    assert_eq!(tips.len(), 1);
    assert_eq!(tips.get(0).unwrap().tip_id, tip_id);

    // original tip_id path still works
    assert_eq!(client.get_tip(&tip_id).tip_id, tip_id);
}

#[test]
fn test_multiple_artists_indexing() {
    let (env, client) = setup();
    let tipper = Address::generate(&env);
    let artist1 = Address::generate(&env);
    let artist2 = Address::generate(&env);

    client.record_verified_tip(
        &String::from_str(&env, "tip_multi_1"),
        &tipper,
        &artist1,
        &100,
        &String::from_str(&env, "tx_multi_1"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_multi_2"),
        &tipper,
        &artist2,
        &200,
        &String::from_str(&env, "tx_multi_2"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_multi_3"),
        &tipper,
        &artist1,
        &300,
        &String::from_str(&env, "tx_multi_3"),
    );
    client.record_verified_tip(
        &String::from_str(&env, "tip_multi_4"),
        &tipper,
        &artist2,
        &400,
        &String::from_str(&env, "tx_multi_4"),
    );

    assert_eq!(client.get_artist_tip_count(&artist1), 2);
    assert_eq!(client.get_artist_tip_count(&artist2), 2);
    assert_eq!(client.get_tips_for_artist(&artist1).len(), 2);
    assert_eq!(client.get_tips_for_artist(&artist2).len(), 2);
    assert_eq!(client.get_tip_count(), 4);
}
