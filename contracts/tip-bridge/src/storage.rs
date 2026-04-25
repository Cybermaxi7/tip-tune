use soroban_sdk::{Env, String};
use crate::types::{BridgeRecord, BridgeBackRecord};

pub fn get_bridge(env: &Env, bridge_id: &String) -> Option<BridgeRecord> {
    env.storage().persistent().get(bridge_id)
}

pub fn set_bridge(env: &Env, bridge_id: &String, record: &BridgeRecord) {
    env.storage().persistent().set(bridge_id, record);
}

pub fn get_bridge_back(env: &Env, bridge_id: &String) -> Option<BridgeBackRecord> {
    env.storage().persistent().get(bridge_id)
}

pub fn set_bridge_back(env: &Env, bridge_id: &String, record: &BridgeBackRecord) {
    env.storage().persistent().set(bridge_id, record);
}
