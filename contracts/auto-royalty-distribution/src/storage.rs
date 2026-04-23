use soroban_sdk::{contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageKey {
    TrackOwner(String),
}

pub fn get_track_owner(env: &Env, track_id: &String) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&StorageKey::TrackOwner(track_id.clone()))
}

pub fn set_track_owner(env: &Env, track_id: &String, owner: &Address) {
    env.storage()
        .persistent()
        .set(&StorageKey::TrackOwner(track_id.clone()), owner);
}
