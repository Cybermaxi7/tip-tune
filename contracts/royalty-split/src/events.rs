use soroban_sdk::{symbol_short, Address, Env, String};

pub fn emit_split_set(env: &Env, track_id: String) {
    env.events()
        .publish((symbol_short!("royalty"), symbol_short!("set"), track_id), ());
}

pub fn emit_collaborator_updated(env: &Env, track_id: String, address: &Address, new_bp: u32) {
    env.events().publish(
        (symbol_short!("collab"), symbol_short!("update"), track_id),
        (address.clone(), new_bp),
    );
}

pub fn emit_collaborator_removed(env: &Env, track_id: String, address: &Address) {
    env.events().publish(
        (symbol_short!("collab"), symbol_short!("remove"), track_id),
        address.clone(),
    );
}
