use soroban_sdk::{Address, Env};

use crate::{AllowlistConfig, AllowlistEntry, DataKey, TokenGateConfig};

const LIFETIME_THRESHOLD: u32 = 100_000;
const EXTEND_TO: u32 = 200_000;

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, EXTEND_TO);
}

pub fn get_config(env: &Env, artist: &Address) -> Option<AllowlistConfig> {
    let key = DataKey::Config(artist.clone());
    let config = env.storage().persistent().get(&key);
    if config.is_some() {
        bump(env, &key);
    }
    config
}

pub fn set_config(env: &Env, artist: &Address, config: &AllowlistConfig) {
    let key = DataKey::Config(artist.clone());
    env.storage().persistent().set(&key, config);
    bump(env, &key);
}

pub fn get_entry(env: &Env, artist: &Address, address: &Address) -> Option<AllowlistEntry> {
    let key = DataKey::Entry(artist.clone(), address.clone());
    let entry = env.storage().persistent().get(&key);
    if entry.is_some() {
        bump(env, &key);
    }
    entry
}

pub fn has_entry(env: &Env, artist: &Address, address: &Address) -> bool {
    get_entry(env, artist, address).is_some()
}

pub fn set_entry(env: &Env, artist: &Address, address: &Address, entry: &AllowlistEntry) {
    let key = DataKey::Entry(artist.clone(), address.clone());
    env.storage().persistent().set(&key, entry);
    bump(env, &key);
}

pub fn remove_entry(env: &Env, artist: &Address, address: &Address) {
    let key = DataKey::Entry(artist.clone(), address.clone());
    env.storage().persistent().remove(&key);
}

pub fn get_token_gate(env: &Env, artist: &Address) -> Option<TokenGateConfig> {
    let key = DataKey::TokenGate(artist.clone());
    let gate = env.storage().persistent().get(&key);
    if gate.is_some() {
        bump(env, &key);
    }
    gate
}

pub fn set_token_gate(env: &Env, artist: &Address, gate: &TokenGateConfig) {
    let key = DataKey::TokenGate(artist.clone());
    env.storage().persistent().set(&key, gate);
    bump(env, &key);
}

pub fn is_manager(env: &Env, artist: &Address, manager: &Address) -> bool {
    let key = DataKey::Manager(artist.clone(), manager.clone());
    let exists = env.storage().persistent().has(&key);
    if exists {
        bump(env, &key);
    }
    exists
}

pub fn set_manager(env: &Env, artist: &Address, manager: &Address, enabled: bool) {
    let key = DataKey::Manager(artist.clone(), manager.clone());
    if enabled {
        env.storage().persistent().set(&key, &true);
        bump(env, &key);
    } else {
        env.storage().persistent().remove(&key);
    }
}
