use soroban_sdk::{Address, Env};

use crate::DataKey;

pub fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn pending_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingAdmin)
}

pub fn set_pending_admin(env: &Env, pending_admin: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::PendingAdmin, pending_admin);
}

pub fn clear_pending_admin(env: &Env) {
    env.storage().instance().remove(&DataKey::PendingAdmin);
}

pub fn mint_authority(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::MintAdmin)
        .unwrap_or(admin(env))
}

pub fn set_mint_admin(env: &Env, mint_admin: Option<Address>) {
    match mint_admin {
        Some(account) => env.storage().instance().set(&DataKey::MintAdmin, &account),
        None => env.storage().instance().remove(&DataKey::MintAdmin),
    }
}

pub fn pause_authority(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::PauseAdmin)
        .unwrap_or(admin(env))
}

pub fn set_pause_admin(env: &Env, pause_admin: Option<Address>) {
    match pause_admin {
        Some(account) => env.storage().instance().set(&DataKey::PauseAdmin, &account),
        None => env.storage().instance().remove(&DataKey::PauseAdmin),
    }
}
