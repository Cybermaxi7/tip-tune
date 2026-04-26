use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::types::Subscription;

const LIFETIME_THRESHOLD: u32 = 100_000;
const EXTEND_TO: u32 = 200_000;

#[contracttype]
#[derive(Clone)]
pub enum IndexKey {
    Active(Address, Address, Address),
    Subscriber(Address),
}

pub fn active_subscription(
    env: &Env,
    subscriber: &Address,
    artist: &Address,
    token: &Address,
) -> Option<String> {
    let key = IndexKey::Active(subscriber.clone(), artist.clone(), token.clone());
    let sub_id = env.storage().persistent().get(&key);
    if sub_id.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
    }
    sub_id
}

pub fn put_active_subscription(env: &Env, sub: &Subscription) {
    let key = IndexKey::Active(
        sub.subscriber.clone(),
        sub.artist.clone(),
        sub.token.clone(),
    );
    env.storage().persistent().set(&key, &sub.id);
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
}

/// Update a subscription in the active index if it should be there.
/// Removes from active index if status is no longer Active.
pub fn update_active_subscription(env: &Env, sub: &Subscription) {
    if sub.status == SubscriptionStatus::Active {
        put_active_subscription(env, sub);
    } else {
        remove_active_subscription(env, sub);
    }
}

pub fn remove_active_subscription(env: &Env, sub: &Subscription) {
    env.storage().persistent().remove(&IndexKey::Active(
        sub.subscriber.clone(),
        sub.artist.clone(),
        sub.token.clone(),
    ));
}

pub fn add_subscriber_subscription(env: &Env, subscriber: &Address, sub_id: &String) {
    let key = IndexKey::Subscriber(subscriber.clone());
    let mut ids: Vec<String> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    if !ids.iter().any(|id| id == *sub_id) {
        ids.push_back(sub_id.clone());
    }
    env.storage().persistent().set(&key, &ids);
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
}

pub fn subscriber_subscriptions(env: &Env, subscriber: &Address) -> Vec<String> {
    let key = IndexKey::Subscriber(subscriber.clone());
    let ids = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
    ids
}
