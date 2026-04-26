#![cfg(test)]

use drip_tip_matching::{PoolStatus, TipMatchingContract, TipMatchingContractClient};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, String};

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let sponsor = Address::generate(&env);
    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);
    let contract_id = env.register_contract(None, TipMatchingContract);

    (env, contract_id, sponsor, artist, tipper)
}

fn tip_id(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

#[test]
fn test_matching_pool_lifecycle() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    let matched = client.apply_match(&pool_id, &100, &tipper, &tip_id(&env, "t1"));
    assert_eq!(matched, 100);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.remaining_amount, 900);
    assert_eq!(pool.matched_amount, 100);
}

#[test]
fn test_apply_match_respects_ratio_and_cap() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &10_000,
        &50,
        &500,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    assert_eq!(client.apply_match(&pool_id, &300, &tipper, &tip_id(&env, "t1")), 150);
    assert_eq!(client.apply_match(&pool_id, &1_000, &tipper, &tip_id(&env, "t2")), 350);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.matched_amount, 500);
    assert_eq!(pool.remaining_amount, 9_500);
}

#[test]
fn test_apply_match_caps_to_remaining_budget() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &100,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    let matched = client.apply_match(&pool_id, &200, &tipper, &tip_id(&env, "t1"));
    assert_eq!(matched, 100);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.remaining_amount, 0);
}

#[test]
fn test_expired_pool_cannot_match() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(&sponsor, &artist, &1000, &100, &0, &0, &1100);

    env.ledger().with_mut(|li| {
        li.timestamp = 1200;
    });

    assert!(client.try_apply_match(&pool_id, &100, &tipper, &tip_id(&env, "t1")).is_err());
    assert!(!client.is_pool_active(&pool_id));
}

#[test]
fn test_cancel_pool_returns_remaining_budget_once() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    client.apply_match(&pool_id, &250, &tipper, &tip_id(&env, "t1"));
    assert_eq!(client.cancel_pool(&pool_id, &sponsor), 750);
    assert!(client.try_cancel_pool(&pool_id, &sponsor).is_err());
}

#[test]
fn test_close_pool_after_exhaustion() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &100,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    client.apply_match(&pool_id, &100, &tipper, &tip_id(&env, "t1"));
    client.close_pool(&pool_id);

    let pool = client.get_pool_status(&pool_id);
    assert_eq!(pool.status, PoolStatus::Closed);
}

#[test]
fn test_budget_accessors_track_pool_state() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    assert_eq!(client.get_remaining_budget(&pool_id), 1000);
    assert_eq!(client.get_matched_amount(&pool_id), 0);

    client.apply_match(&pool_id, &250, &tipper, &tip_id(&env, "t1"));
    assert_eq!(client.get_remaining_budget(&pool_id), 750);
    assert_eq!(client.get_matched_amount(&pool_id), 250);
}

#[test]
fn test_duplicate_tip_rejected() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    client.apply_match(&pool_id, &100, &tipper, &tip_id(&env, "tip-abc"));
    let result = client.try_apply_match(&pool_id, &100, &tipper, &tip_id(&env, "tip-abc"));
    assert!(result.is_err());
}

#[test]
fn test_tipper_cap_enforced() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &200,
        &(env.ledger().timestamp() + 1000),
    );

    assert_eq!(client.apply_match(&pool_id, &150, &tipper, &tip_id(&env, "t1")), 150);
    assert_eq!(client.apply_match(&pool_id, &150, &tipper, &tip_id(&env, "t2")), 50);
    let result = client.try_apply_match(&pool_id, &100, &tipper, &tip_id(&env, "t3"));
    assert!(result.is_err());
}

#[test]
fn test_tipper_cap_independent_per_tipper() {
    let (env, contract_id, sponsor, artist, tipper) = setup();
    let tipper2 = Address::generate(&env);
    let client = TipMatchingContractClient::new(&env, &contract_id);
    let pool_id = client.create_matching_pool(
        &sponsor,
        &artist,
        &1000,
        &100,
        &0,
        &100,
        &(env.ledger().timestamp() + 1000),
    );

    assert_eq!(client.apply_match(&pool_id, &100, &tipper, &tip_id(&env, "t1")), 100);
    assert!(client.try_apply_match(&pool_id, &100, &tipper, &tip_id(&env, "t2")).is_err());
    assert_eq!(client.apply_match(&pool_id, &100, &tipper2, &tip_id(&env, "t3")), 100);
}

#[test]
fn test_query_indexes_by_sponsor_and_artist() {
    let (env, contract_id, sponsor, artist, _tipper) = setup();
    let client = TipMatchingContractClient::new(&env, &contract_id);

    let pool1 = client.create_matching_pool(
        &sponsor,
        &artist,
        &500,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );
    let pool2 = client.create_matching_pool(
        &sponsor,
        &artist,
        &300,
        &100,
        &0,
        &0,
        &(env.ledger().timestamp() + 1000),
    );

    let by_sponsor = client.list_pools_by_sponsor(&sponsor);
    assert_eq!(by_sponsor.len(), 2);
    assert!(by_sponsor.contains(&pool1));
    assert!(by_sponsor.contains(&pool2));

    let by_artist = client.list_pools_by_artist(&artist);
    assert_eq!(by_artist.len(), 2);
}
