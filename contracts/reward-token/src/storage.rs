use soroban_sdk::{Address, Env};

use crate::DataKey;

const LIFETIME_THRESHOLD: u32 = 100_000;
const EXTEND_TO: u32 = 200_000;

/// Read balance and extend TTL.
pub fn read_balance(env: &Env, account: &Address) -> i128 {
    let key = DataKey::Balance(account.clone());
    let val: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if val != 0 {
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
    }
    val
}

/// Write balance and extend TTL.
pub fn write_balance(env: &Env, account: &Address, balance: i128) {
    let key = DataKey::Balance(account.clone());
    env.storage().persistent().set(&key, &balance);
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
}

/// Read allowance and extend TTL.
pub fn read_allowance(env: &Env, from: &Address, spender: &Address) -> i128 {
    let key = DataKey::Allowance(from.clone(), spender.clone());
    let val: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    if val != 0 {
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
    }
    val
}

/// Write allowance and extend TTL.
pub fn write_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
    let key = DataKey::Allowance(from.clone(), spender.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, EXTEND_TO);
}