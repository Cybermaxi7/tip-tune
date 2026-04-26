use crate::types::{DataKey, TimeLockTip};
use soroban_sdk::{Address, Env, String, Vec};

pub fn save_tip(env: &Env, lock_id: String, tip: &TimeLockTip) {
    let key = DataKey::Tip(lock_id.clone());
    env.storage().persistent().set(&key, tip);

    // Update list of artist tips
    let artist_key = DataKey::ArtistTips(tip.artist.clone());
    let mut artist_tips: Vec<String> = env
        .storage()
        .persistent()
        .get(&artist_key)
        .unwrap_or(Vec::new(env));
    artist_tips.push_back(lock_id.clone());
    env.storage().persistent().set(&artist_key, &artist_tips);

    // Update tipper index
    let tipper_key = DataKey::TipperTips(tip.tipper.clone());
    let mut tipper_tips: Vec<String> = env
        .storage()
        .persistent()
        .get(&tipper_key)
        .unwrap_or(Vec::new(env));
    tipper_tips.push_back(lock_id.clone());
    env.storage().persistent().set(&tipper_key, &tipper_tips);
}

pub fn get_tip(env: &Env, lock_id: String) -> Option<TimeLockTip> {
    let key = DataKey::Tip(lock_id);
    env.storage().persistent().get(&key)
}

pub fn update_tip(env: &Env, tip: &TimeLockTip) {
    let key = DataKey::Tip(tip.lock_id.clone());
    env.storage().persistent().set(&key, tip);
}

pub fn get_artist_tips(env: &Env, artist: Address) -> Vec<String> {
    let artist_key = DataKey::ArtistTips(artist);
    env.storage()
        .persistent()
        .get(&artist_key)
        .unwrap_or(Vec::new(env))
}

pub fn get_tipper_tips(env: &Env, tipper: Address) -> Vec<String> {
    let tipper_key = DataKey::TipperTips(tipper);
    env.storage()
        .persistent()
        .get(&tipper_key)
        .unwrap_or(Vec::new(env))
}

pub fn increment_counter(env: &Env) -> u32 {
    let key = DataKey::Counter;
    let mut counter: u32 = env.storage().instance().get(&key).unwrap_or(0);
    counter += 1;
    env.storage().instance().set(&key, &counter);
    counter
}
