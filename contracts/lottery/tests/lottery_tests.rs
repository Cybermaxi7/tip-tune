#![cfg(test)]
use lottery::{Lottery, LotteryClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, String,
};

#[test]
fn test_lottery_full_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);

    let client = LotteryClient::new(&env, &env.register_contract(None, Lottery));

    let pool_id = String::from_str(&env, "pool1");

    // Create lottery
    client.create_lottery(&pool_id, &artist, &5, &(env.ledger().timestamp() + 100));

    // Enter lottery — contributions are escrowed at 5% of tip_amount
    client.enter_lottery(&pool_id, &tipper1, &100); // 10 tickets, 5 escrowed
    client.enter_lottery(&pool_id, &tipper2, &200); // 20 tickets, 10 escrowed

    // Fast-forward time
    let new_time = env.ledger().timestamp() + 200;
    env.ledger().with_mut(|l| l.timestamp = new_time);

    // Draw winner
    let winner = client.draw_winner(&pool_id);
    assert!(winner == tipper1 || winner == tipper2);

    // Claim prize — winner receives the full escrowed prize pool
    let prize = client.claim_prize(&pool_id, &winner);
    assert_eq!(prize, 15); // (100 * 5%) + (200 * 5%) = 5 + 10 = 15

    // Try to claim again — must fail
    let result = client.try_claim_prize(&pool_id, &winner);
    assert!(result.is_err());
}

#[test]
fn test_lottery_cancellation_and_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = LotteryClient::new(&env, &env.register_contract(None, Lottery));
    let pool_id = String::from_str(&env, "pool2");

    client.create_lottery(&pool_id, &artist, &10, &(env.ledger().timestamp() + 100));
    // tipper contributes 100; 10 are escrowed (10%)
    client.enter_lottery(&pool_id, &tipper, &100);

    // Cancel lottery
    client.cancel_lottery(&pool_id);

    // Try to enter cancelled lottery
    let enter_result = client.try_enter_lottery(&pool_id, &tipper, &100);
    assert!(enter_result.is_err());

    // Claim refund — tipper receives their escrowed 10 back
    let refund = client.claim_refund(&pool_id, &tipper);
    assert_eq!(refund, 10); // 100 * 10% = 10
}

#[test]
fn test_claim_window_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = LotteryClient::new(&env, &env.register_contract(None, Lottery));
    let pool_id = String::from_str(&env, "pool3");

    client.create_lottery(&pool_id, &artist, &10, &(env.ledger().timestamp() + 100));
    client.enter_lottery(&pool_id, &tipper, &100);

    let draw_time = env.ledger().timestamp() + 200;
    env.ledger().with_mut(|l| l.timestamp = draw_time);
    let winner = client.draw_winner(&pool_id);

    // Fast-forward past claim window (7 days + 1 second)
    let expiry_time = env.ledger().timestamp() + 604801;
    env.ledger().with_mut(|l| l.timestamp = expiry_time);

    let result = client.try_claim_prize(&pool_id, &winner);
    assert!(result.is_err());
}

#[test]
fn test_escrow_balance_tracks_contributions() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);

    let client = LotteryClient::new(&env, &env.register_contract(None, Lottery));
    let pool_id = String::from_str(&env, "pool_escrow");

    // 20% contribution rate
    client.create_lottery(&pool_id, &artist, &20, &(env.ledger().timestamp() + 100));

    // Both tippers enter; escrowed amounts should be 20% of tip
    let t1 = client.enter_lottery(&pool_id, &tipper1, &500); // 50 tickets, 100 escrowed
    let t2 = client.enter_lottery(&pool_id, &tipper2, &1000); // 100 tickets, 200 escrowed
    assert_eq!(t1, 50);
    assert_eq!(t2, 100);

    let new_time = env.ledger().timestamp() + 200;
    env.ledger().with_mut(|l| l.timestamp = new_time);

    let winner = client.draw_winner(&pool_id);
    // Total escrowed prize pool = 100 + 200 = 300
    let prize = client.claim_prize(&pool_id, &winner);
    assert_eq!(prize, 300);
}

#[test]
fn test_refund_returns_escrowed_amount_only() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = LotteryClient::new(&env, &env.register_contract(None, Lottery));
    let pool_id = String::from_str(&env, "pool_refund_exact");

    // 25% contribution rate
    client.create_lottery(&pool_id, &artist, &25, &(env.ledger().timestamp() + 100));
    client.enter_lottery(&pool_id, &tipper, &400); // 400 * 25% = 100 escrowed

    client.cancel_lottery(&pool_id);

    // Refund must equal the escrowed portion, not the full tip
    let refund = client.claim_refund(&pool_id, &tipper);
    assert_eq!(refund, 100);
}
