use soroban_sdk::{Env, String};
use crate::types::StreamRecord;

pub fn get_stream(env: &Env, stream_id: &String) -> Option<StreamRecord> {
    let key = stream_id.clone();
    env.storage().persistent().get(&key)
}

pub fn set_stream(env: &Env, stream_id: &String, record: &StreamRecord) {
    let key = stream_id.clone();
    env.storage().persistent().set(&key, record);
}
