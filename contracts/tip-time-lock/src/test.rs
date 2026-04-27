#![cfg(test)]

use super::*;
use crate::rent::DAY_IN_LEDGERS;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, Address, Env, Ledger};

fn set_ledger(env: &Env, number: u32, timestamp: u64, max_entry_ttl: u32) {
    env.ledger().set(Ledger {
        number,
        timestamp,
        network_id: [0; 32],
        base_reserve: 100,
        min_persistent_entry_ttl: 10,
        min_temp_entry_ttl: 10,
        max_entry_ttl,
    });
}

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let contract_address = env.register_stellar_asset_contract_v2(admin.clone());
    (
        token::Client::new(env, &contract_address.address()),
        token::StellarAssetClient::new(env, &contract_address.address()),
    )
}

#[test]
fn test_tip_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    let amount = 100;
    let message = String::from_str(&env, "Happy Birthday!");

    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &amount,
        &token.address,
        &unlock_time,
        &message,
        &1,
    );

    // Check balance
    assert_eq!(token.balance(&tipper), 900);
    assert_eq!(token.balance(&contract_id), 100);

    // Try to claim before unlock
    let result = client.try_claim_tip(&lock_id, &artist, &1);
    assert!(result.is_err());

    // Advance time to unlock
    env.ledger().set_timestamp(unlock_time);

    // Claim
    client.claim_tip(&lock_id, &artist, &2);

    // Check balance
    assert_eq!(token.balance(&artist), 100);
    assert_eq!(token.balance(&contract_id), 0);

    // Check pending tips
    let pending = client.get_pending_tips(&artist);
    assert_eq!(pending.len(), 0);
}

#[test]
fn test_refund_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    let amount = 100;
    let message = String::from_str(&env, "Testing refund");

    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &amount,
        &token.address,
        &unlock_time,
        &message,
        &1,
    );

    // Try to refund before 30 days
    env.ledger().set_timestamp(unlock_time + 100);
    let result = client.try_refund_tip(&lock_id, &tipper, &2);
    assert!(result.is_err());

    // Advance time to 30 days after unlock
    let thirty_days = 30 * 24 * 60 * 60;
    env.ledger().set_timestamp(unlock_time + thirty_days);

    // Refund
    client.refund_tip(&lock_id, &tipper, &3);

    // Check balances
    assert_eq!(token.balance(&tipper), 1000);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn test_get_pending_tips() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &(current_time + 1000),
        &String::from_str(&env, "Tip 1"),
        &1,
    );
    client.create_time_lock_tip(
        &tipper,
        &artist,
        &200,
        &token.address,
        &(current_time + 2000),
        &String::from_str(&env, "Tip 2"),
        &2,
    );

    let pending = client.get_pending_tips(&artist);
    assert_eq!(pending.len(), 2);
    assert_eq!(pending.get(0).unwrap().amount, 100);
    assert_eq!(pending.get(1).unwrap().amount, 200);
}

#[test]
fn test_replay_create_time_lock_tip_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    let amount = 100;
    let message = String::from_str(&env, "Test");

    client.create_time_lock_tip(
        &tipper,
        &artist,
        &amount,
        &token.address,
        &unlock_time,
        &message,
        &1,
    );
    let result = client.try_create_time_lock_tip(
        &tipper,
        &artist,
        &amount,
        &token.address,
        &unlock_time,
        &message,
        &1,
    );
    assert!(result.is_err());
}

#[test]
fn test_replay_claim_tip_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    let amount = 100;
    let message = String::from_str(&env, "Test");

    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &amount,
        &token.address,
        &unlock_time,
        &message,
        &1,
    );

    // Advance time
    env.ledger().set_timestamp(unlock_time);

    client.claim_tip(&lock_id, &artist, &1);
    let result = client.try_claim_tip(&lock_id, &artist, &1);
    assert!(result.is_err());
}

#[test]
fn test_replay_refund_tip_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    let amount = 100;
    let message = String::from_str(&env, "Test");

    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &amount,
        &token.address,
        &unlock_time,
        &message,
        &1,
    );

    // Advance time for refund
    let thirty_days = 30 * 24 * 60 * 60;
    env.ledger().set_timestamp(unlock_time + thirty_days);

    client.refund_tip(&lock_id, &tipper, &2);
    let result = client.try_refund_tip(&lock_id, &tipper, &2);
    assert!(result.is_err());
}

#[test]
fn test_get_tipper_tip_ids() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper1, &1000);
    token_admin.mint(&tipper2, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let _lock_id1 = client.create_time_lock_tip(
        &tipper1,
        &artist,
        &100,
        &token.address,
        &(current_time + 1000),
        &String::from_str(&env, "Tip 1"),
        &1,
    );
    let _lock_id2 = client.create_time_lock_tip(
        &tipper1,
        &artist,
        &200,
        &token.address,
        &(current_time + 2000),
        &String::from_str(&env, "Tip 2"),
        &2,
    );
    client.create_time_lock_tip(
        &tipper2,
        &artist,
        &300,
        &token.address,
        &(current_time + 3000),
        &String::from_str(&env, "Tip 3"),
        &1,
    );

    // Query tipper1's tips
    let tipper1_tips = client.get_tipper_tip_ids(&tipper1);
    assert_eq!(tipper1_tips.len(), 2);

    // Query tipper2's tips
    let tipper2_tips = client.get_tipper_tip_ids(&tipper2);
    assert_eq!(tipper2_tips.len(), 1);
}

#[test]
fn test_get_tipper_tip_details() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &unlock_time,
        &String::from_str(&env, "Detail Tip"),
        &1,
    );

    let details = client.get_tipper_tip_details(&tipper);
    assert_eq!(details.len(), 1);
    assert_eq!(details.get(0).unwrap().amount, 100);
    assert_eq!(details.get(0).unwrap().status, TimeLockStatus::Locked);
}

#[test]
fn test_get_refundable_locks() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &unlock_time,
        &String::from_str(&env, "Refundable Tip"),
        &1,
    );

    // Before 30 days after unlock: not refundable
    env.ledger().set_timestamp(unlock_time + 100);
    let refundable_before = client.get_refundable_locks(&tipper);
    assert_eq!(refundable_before.len(), 0);

    // After 30 days: refundable
    let thirty_days = 30 * 24 * 60 * 60;
    env.ledger().set_timestamp(unlock_time + thirty_days);
    let refundable_after = client.get_refundable_locks(&tipper);
    assert_eq!(refundable_after.len(), 1);
    assert_eq!(refundable_after.get(0).unwrap(), lock_id);
}

#[test]
fn test_get_refundable_locks_after_claim() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &unlock_time,
        &String::from_str(&env, "Claimed Tip"),
        &1,
    );

    // Advance time past unlock
    env.ledger().set_timestamp(unlock_time);

    // Claim the tip
    client.claim_tip(&String::from_str(&env, "1"), &artist, &1);

    // Even after 30 days, no refundable locks
    let thirty_days = 30 * 24 * 60 * 60;
    env.ledger().set_timestamp(unlock_time + thirty_days);
    let refundable = client.get_refundable_locks(&tipper);
    assert_eq!(refundable.len(), 0);

    // But tipper's history still exists
    let details = client.get_tipper_tip_details(&tipper);
    assert_eq!(details.len(), 1);
    assert_eq!(details.get(0).unwrap().status, TimeLockStatus::Claimed);
}

#[test]
fn test_get_refundable_locks_after_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    let unlock_time = current_time + 1000;
    client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &unlock_time,
        &String::from_str(&env, "Refunded Tip"),
        &1,
    );

    // After 30 days, refund
    let thirty_days = 30 * 24 * 60 * 60;
    env.ledger().set_timestamp(unlock_time + thirty_days);
    client.refund_tip(&String::from_str(&env, "1"), &tipper, &2);

    // No refundable locks after refund
    let refundable = client.get_refundable_locks(&tipper);
    assert_eq!(refundable.len(), 0);

    // But history shows Refunded status
    let details = client.get_tipper_tip_details(&tipper);
    assert_eq!(details.len(), 1);
    assert_eq!(details.get(0).unwrap().status, TimeLockStatus::Refunded);
}

#[test]
fn test_tipper_tip_history_across_transitions() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1000);

    let current_time = 10000;
    env.ledger().set_timestamp(current_time);

    // Create two tips
    client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &(current_time + 1000),
        &String::from_str(&env, "Tip A"),
        &1,
    );
    client.create_time_lock_tip(
        &tipper,
        &artist,
        &200,
        &token.address,
        &(current_time + 2000),
        &String::from_str(&env, "Tip B"),
        &2,
    );

    let history = client.get_tipper_tip_details(&tipper);
    assert_eq!(history.len(), 2);
    assert_eq!(history.get(0).unwrap().amount, 100);
    assert_eq!(history.get(1).unwrap().amount, 200);

    // Advance and claim first tip
    env.ledger().set_timestamp(current_time + 1000);
    client.claim_tip(&String::from_str(&env, "1"), &artist, &1);

    let history_after_claim = client.get_tipper_tip_details(&tipper);
    assert_eq!(history_after_claim.len(), 2);
    assert_eq!(history_after_claim.get(0).unwrap().status, TimeLockStatus::Claimed);
    assert_eq!(history_after_claim.get(1).unwrap().status, TimeLockStatus::Locked);
}

#[test]
fn test_active_lock_survives_ledger_bump_refresh() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger(&env, 1, 1_000, 220);

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1_000);

    let unlock_time = env.ledger().timestamp() + 100;
    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &unlock_time,
        &String::from_str(&env, "TTL refresh"),
        &1,
    );

    set_ledger(&env, 150, 1_745, 220);
    let pending = client.get_pending_tips(&artist);
    assert_eq!(pending.len(), 1);
    assert_eq!(pending.get(0).unwrap().lock_id, lock_id);

    set_ledger(&env, 221, 2_100, 220);
    client.claim_tip(&lock_id, &artist, &2);

    assert_eq!(token.balance(&artist), 100);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn test_actor_nonce_refresh_persists_replay_protection() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger(&env, 1, 10_000, 240);

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &2_000);

    let first_unlock = env.ledger().timestamp() + 50;
    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &first_unlock,
        &String::from_str(&env, "Initial nonce"),
        &1,
    );

    set_ledger(&env, 180, 11_000, 240);
    client.claim_tip(&lock_id, &artist, &1);

    let stale_nonce_attempt = client.try_create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &(env.ledger().timestamp() + 120),
        &String::from_str(&env, "Stale nonce"),
        &1,
    );
    assert!(stale_nonce_attempt.is_err());

    set_ledger(&env, 241, 11_305, 240);
    let second_lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &150,
        &token.address,
        &(env.ledger().timestamp() + 120),
        &String::from_str(&env, "Fresh nonce"),
        &2,
    );

    assert_ne!(second_lock_id, lock_id);
    assert_eq!(client.get_tipper_tip_ids(&tipper).len(), 2);
}

#[test]
fn test_refundable_history_survives_long_wait_with_refresh() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger(&env, 1, 5_000, 320);

    let contract_id = env.register_contract(None, TimeLockContract);
    let client = TimeLockContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let artist = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&tipper, &1_000);

    let unlock_time = env.ledger().timestamp() + 20;
    let lock_id = client.create_time_lock_tip(
        &tipper,
        &artist,
        &100,
        &token.address,
        &unlock_time,
        &String::from_str(&env, "Refund wait"),
        &1,
    );

    set_ledger(&env, 150, unlock_time + (15 * 24 * 60 * 60), 320);
    assert_eq!(client.get_tipper_tip_details(&tipper).len(), 1);

    let refund_time = unlock_time + (30 * 24 * 60 * 60);
    set_ledger(
        &env,
        280,
        refund_time + (DAY_IN_LEDGERS as u64 * 5 / DAY_IN_LEDGERS as u64),
        320,
    );

    let refundable = client.get_refundable_locks(&tipper);
    assert_eq!(refundable.len(), 1);
    assert_eq!(refundable.get(0).unwrap(), lock_id);
}
