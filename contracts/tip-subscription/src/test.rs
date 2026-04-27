#![cfg(test)]

use super::*;
use super::types::GRACE_PERIOD_SECONDS;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

#[allow(deprecated)]
fn setup_test() -> (
    Env,
    TipSubscriptionContractClient<'static>,
    Address,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let contract_id = env.register_contract(None, TipSubscriptionContract);
    let client = TipSubscriptionContractClient::new(&env, &contract_id);

    let subscriber = Address::generate(&env);
    let artist = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    token_admin_client.mint(&subscriber, &10_000);

    (
        env,
        client,
        subscriber,
        artist,
        token_client,
        token_admin_client,
    )
}

#[allow(deprecated)]
fn setup_subscription_with_balance(
    balance: i128,
) -> (
    Env,
    TipSubscriptionContractClient<'static>,
    Address,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let contract_id = env.register_contract(None, TipSubscriptionContract);
    let client = TipSubscriptionContractClient::new(&env, &contract_id);

    let subscriber = Address::generate(&env);
    let artist = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    token_admin_client.mint(&subscriber, &balance);

    (
        env,
        client,
        subscriber,
        artist,
        token_client,
        token_admin_client,
    )
}

#[test]
fn test_create_and_process_subscription() {
    let (env, client, subscriber, artist, token_client, _) = setup_test();

    let amount = 500;

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &amount,
        &SubscriptionFrequency::Weekly,
    );

    let sub = client.get_subscription(&sub_id);
    assert_eq!(sub.status, SubscriptionStatus::Active);
    assert_eq!(sub.amount, amount);

    env.ledger().with_mut(|li| {
        li.timestamp = WEEK_IN_SECONDS + 1;
    });

    let initial_artist_balance = token_client.balance(&artist);
    let initial_subscriber_balance = token_client.balance(&subscriber);

    client.process_payment(&sub_id);

    assert_eq!(
        token_client.balance(&artist),
        initial_artist_balance + amount
    );
    assert_eq!(
        token_client.balance(&subscriber),
        initial_subscriber_balance - amount
    );
}

// FIXED: Added the `#` to match Soroban's new custom error output formatting
#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_payment_too_early() {
    let (_, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Monthly,
    );

    client.process_payment(&sub_id);
}

#[test]
fn test_lifecycle_pause_resume_cancel() {
    let (_, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    client.pause_subscription(&sub_id);
    assert_eq!(
        client.get_subscription(&sub_id).status,
        SubscriptionStatus::Paused
    );

    client.resume_subscription(&sub_id);
    assert_eq!(
        client.get_subscription(&sub_id).status,
        SubscriptionStatus::Active
    );

    client.cancel_subscription(&sub_id);
    assert_eq!(
        client.get_subscription(&sub_id).status,
        SubscriptionStatus::Cancelled
    );
}

#[test]
fn test_duplicate_active_subscription_is_rejected() {
    let (_, client, subscriber, artist, token_client, _) = setup_test();

    client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    assert!(client
        .try_create_subscription(
            &subscriber,
            &artist,
            &token_client.address,
            &100,
            &SubscriptionFrequency::Weekly,
        )
        .is_err());
}

#[test]
fn test_get_subscriptions_by_subscriber() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let contract_id = env.register_contract(None, TipSubscriptionContract);
    let client = TipSubscriptionContractClient::new(&env, &contract_id);

    let subscriber = Address::generate(&env);
    let artist1 = Address::generate(&env);
    let artist2 = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id);

    let sub_id1 = client.create_subscription(
        &subscriber,
        &artist1,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );
    let sub_id2 = client.create_subscription(
        &subscriber,
        &artist2,
        &token_client.address,
        &200,
        &SubscriptionFrequency::Monthly,
    );

    let ids = client.get_sub_ids_by_subscriber(&subscriber);
    assert_eq!(ids.len(), 2);
    assert_eq!(ids.get(0).unwrap(), sub_id1);
    assert_eq!(ids.get(1).unwrap(), sub_id2);

    let subscriptions = client.get_subscriptions_by_subscriber(&subscriber);
    assert_eq!(subscriptions.len(), 2);
    assert_eq!(subscriptions.get(0).unwrap().amount, 100);
    assert_eq!(subscriptions.get(1).unwrap().amount, 200);
}

#[test]
fn test_cancel_allows_recreate_for_same_relationship() {
    let (_, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );
    client.cancel_subscription(&sub_id);

    let recreated = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &150,
        &SubscriptionFrequency::Monthly,
    );

    assert_ne!(sub_id, recreated);
    assert_eq!(
        client.get_subscription(&recreated).status,
        SubscriptionStatus::Active
    );
}

#[test]
fn test_grace_period_transition() {
    let (env, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    // Advance time to shortly after next_payment_timestamp but within grace period
    env.ledger().with_mut(|li| {
        li.timestamp = WEEK_IN_SECONDS + 1; // 1 second past due
    });

    // Refresh status to update to GracePeriod
    client.refresh_subscription_status(&sub_id).unwrap();
    let sub = client.get_subscription(&sub_id);
    assert_eq!(sub.status, SubscriptionStatus::GracePeriod);

    // Process payment within grace period should succeed and return to Active
    client.process_payment(&sub_id).unwrap();

    let sub = client.get_subscription(&sub_id);
    assert_eq!(sub.status, SubscriptionStatus::Active);
    // next_payment_timestamp should have been rescheduled
    assert!(sub.next_payment_timestamp > WEEK_IN_SECONDS + 1);
}

#[test]
fn test_past_due_transition_and_recovery() {
    let (env, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    // Advance time beyond grace period (7 days late)
    env.ledger().with_mut(|li| {
        li.timestamp = WEEK_IN_SECONDS + GRACE_PERIOD_SECONDS + 1;
    });

    // Refresh status should transition to PastDue
    client.refresh_subscription_status(&sub_id).unwrap();
    let sub = client.get_subscription(&sub_id);
    assert_eq!(sub.status, SubscriptionStatus::PastDue);

    // Process payment should still succeed and recover to Active
    client.process_payment(&sub_id).unwrap();

    let sub = client.get_subscription(&sub_id);
    assert_eq!(sub.status, SubscriptionStatus::Active);
}

#[test]
fn test_payment_failure_grace_to_pastdue() {
    // Low balance setup: 50 tokens only, payment is 100
    let (env, client, subscriber, artist, token_client, _) = setup_subscription_with_balance(50);

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    // Advance to within grace period
    env.ledger().with_mut(|li| {
        li.timestamp = WEEK_IN_SECONDS + 1;
    });

    // Payment should fail due to insufficient balance
    let result = client.try_process_payment(&sub_id);
    assert_eq!(result, Err(Ok(Error::PaymentFailed)));

    // Status should transition from GracePeriod to PastDue
    let sub = client.get_subscription(&sub_id);
    assert_eq!(sub.status, SubscriptionStatus::PastDue);
}

#[test]
fn test_payment_failure_pastdue_stays_pastdue() {
    // Low balance setup: 50 tokens only
    let (env, client, subscriber, artist, token_client, _) = setup_subscription_with_balance(50);

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    // Advance beyond grace period so initially PastDue
    env.ledger().with_mut(|li| {
        li.timestamp = WEEK_IN_SECONDS + GRACE_PERIOD_SECONDS + 1;
    });

    // Refresh to become PastDue (if not already auto)
    client.refresh_subscription_status(&sub_id).unwrap();
    assert_eq!(client.get_subscription(&sub_id).status, SubscriptionStatus::PastDue);

    // Payment attempt fails; status remains PastDue
    let result = client.try_process_payment(&sub_id);
    assert_eq!(result, Err(Ok(Error::PaymentFailed)));

    let sub = client.get_subscription(&sub_id);
    assert_eq!(sub.status, SubscriptionStatus::PastDue);
}

#[test]
fn test_cannot_process_payment_when_paused() {
    let (env, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    client.pause_subscription(&sub_id);
    assert_eq!(client.get_subscription(&sub_id).status, SubscriptionStatus::Paused);

    // Payment should fail with InvalidStatus
    let result = client.try_process_payment(&sub_id);
    assert_eq!(result, Err(Ok(Error::InvalidStatus)));
}

#[test]
fn test_cannot_process_payment_when_cancelled() {
    let (env, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    client.cancel_subscription(&sub_id);
    assert_eq!(client.get_subscription(&sub_id).status, SubscriptionStatus::Cancelled);

    let result = client.try_process_payment(&sub_id);
    assert_eq!(result, Err(Ok(Error::InvalidStatus)));
}

#[test]
fn test_refresh_status_updates_grace_and_pastdue() {
    let (env, client, subscriber, artist, token_client, _) = setup_test();

    let sub_id = client.create_subscription(
        &subscriber,
        &artist,
        &token_client.address,
        &100,
        &SubscriptionFrequency::Weekly,
    );

    // Initially Active
    assert_eq!(client.get_subscription(&sub_id).status, SubscriptionStatus::Active);

    // Move to after due, within grace
    env.ledger().with_mut(|li| {
        li.timestamp = WEEK_IN_SECONDS + 1;
    });
    client.refresh_subscription_status(&sub_id).unwrap();
    assert_eq!(client.get_subscription(&sub_id).status, SubscriptionStatus::GracePeriod);

    // Move past grace period
    env.ledger().with_mut(|li| {
        li.timestamp = WEEK_IN_SECONDS + GRACE_PERIOD_SECONDS + 100;
    });
    client.refresh_subscription_status(&sub_id).unwrap();
    assert_eq!(client.get_subscription(&sub_id).status, SubscriptionStatus::PastDue);
}
