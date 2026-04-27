use crate::{rent, types::{DataKey, TimeLockTip}};
use soroban_sdk::{Address, Env, String, Vec};

pub fn save_tip(env: &Env, lock_id: String, tip: &TimeLockTip) {
    let ttl = rent::ttl_for_tip(env, tip);
    let key = DataKey::Tip(lock_id.clone());
    env.storage().persistent().set(&key, tip);
    rent::extend_persistent(env, &key, ttl);

    // Update list of artist tips
    let artist_key = DataKey::ArtistTips(tip.artist.clone());
    let mut artist_tips: Vec<String> = env
        .storage()
        .persistent()
        .get(&artist_key)
        .unwrap_or(Vec::new(env));
    artist_tips.push_back(lock_id.clone());
    env.storage().persistent().set(&artist_key, &artist_tips);
    rent::extend_persistent(env, &artist_key, ttl);

    // Update tipper index
    let tipper_key = DataKey::TipperTips(tip.tipper.clone());
    let mut tipper_tips: Vec<String> = env
        .storage()
        .persistent()
        .get(&tipper_key)
        .unwrap_or(Vec::new(env));
    tipper_tips.push_back(lock_id.clone());
    env.storage().persistent().set(&tipper_key, &tipper_tips);
    rent::extend_persistent(env, &tipper_key, ttl);
    rent::extend_instance(env, ttl.max(rent::instance_access_ttl()));
}

pub fn get_tip(env: &Env, lock_id: String) -> Option<TimeLockTip> {
    let key = DataKey::Tip(lock_id);
    let tip = env.storage().persistent().get::<DataKey, TimeLockTip>(&key);
    if let Some(ref live_tip) = tip {
        let ttl = rent::ttl_for_tip(env, live_tip);
        rent::extend_persistent(env, &key, ttl);
        rent::extend_instance(env, ttl.max(rent::instance_access_ttl()));
    }
    tip
}

pub fn update_tip(env: &Env, tip: &TimeLockTip) {
    let ttl = rent::ttl_for_tip(env, tip);
    let key = DataKey::Tip(tip.lock_id.clone());
    env.storage().persistent().set(&key, tip);
    rent::extend_persistent(env, &key, ttl);

    let artist_key = DataKey::ArtistTips(tip.artist.clone());
    rent::extend_persistent(env, &artist_key, ttl);

    let tipper_key = DataKey::TipperTips(tip.tipper.clone());
    rent::extend_persistent(env, &tipper_key, ttl);
    rent::extend_instance(env, ttl.max(rent::instance_access_ttl()));
}

pub fn get_artist_tips(env: &Env, artist: Address) -> Vec<String> {
    let artist_key = DataKey::ArtistTips(artist);
    let tips = env.storage()
        .persistent()
        .get(&artist_key)
        .unwrap_or(Vec::new(env));
    if !tips.is_empty() {
        rent::extend_persistent(env, &artist_key, rent::index_access_ttl());
    }
    tips
}

pub fn get_tipper_tips(env: &Env, tipper: Address) -> Vec<String> {
    let tipper_key = DataKey::TipperTips(tipper);
    let tips = env.storage()
        .persistent()
        .get(&tipper_key)
        .unwrap_or(Vec::new(env));
    if !tips.is_empty() {
        rent::extend_persistent(env, &tipper_key, rent::index_access_ttl());
    }
    tips
}

pub fn increment_counter(env: &Env) -> u32 {
    let key = DataKey::Counter;
    let mut counter: u32 = env.storage().instance().get(&key).unwrap_or(0);
    counter += 1;
    env.storage().instance().set(&key, &counter);
    rent::extend_instance(env, rent::instance_access_ttl());
    counter
}

pub fn get_actor_nonce(env: &Env, actor: &Address) -> u64 {
    let nonce = env
        .storage()
        .instance()
        .get(&DataKey::ActorNonce(actor.clone()))
        .unwrap_or(0);

    if nonce > 0 {
        rent::extend_instance(env, rent::instance_access_ttl());
    }

    nonce
}

pub fn set_actor_nonce(env: &Env, actor: &Address, nonce: u64) {
    env.storage()
        .instance()
        .set(&DataKey::ActorNonce(actor.clone()), &nonce);
    rent::extend_instance(env, rent::instance_access_ttl());
}
