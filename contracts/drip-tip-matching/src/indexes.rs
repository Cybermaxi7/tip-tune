use soroban_sdk::{contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone)]
pub enum TipperKey {
    Matched(String, Address),
    TipUsed(String, String),
}

pub fn get_tipper_matched(env: &Env, pool_id: &String, tipper: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&TipperKey::Matched(pool_id.clone(), tipper.clone()))
        .unwrap_or(0)
}

pub fn set_tipper_matched(env: &Env, pool_id: &String, tipper: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&TipperKey::Matched(pool_id.clone(), tipper.clone()), &amount);
}

pub fn is_tip_used(env: &Env, pool_id: &String, tip_id: &String) -> bool {
    env.storage()
        .persistent()
        .has(&TipperKey::TipUsed(pool_id.clone(), tip_id.clone()))
}

pub fn mark_tip_used(env: &Env, pool_id: &String, tip_id: &String) {
    env.storage()
        .persistent()
        .set(&TipperKey::TipUsed(pool_id.clone(), tip_id.clone()), &true);
}
