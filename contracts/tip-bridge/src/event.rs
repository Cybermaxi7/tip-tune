use soroban_sdk::{Env, symbol_short};

pub fn bridge_initiated(_env: &Env, _bridge_id: &soroban_sdk::String, _amount: i128, _fee: i128) {
    // Event emission simplified
}

pub fn bridge_completed(_env: &Env, _bridge_id: &soroban_sdk::String, _net_amount: i128) {
    // Event emission simplified
}

pub fn bridge_back_initiated(_env: &Env, _bridge_id: &soroban_sdk::String, _amount: i128) {
    // Event emission simplified
}

pub fn proof_submitted(_env: &Env, _bridge_id: &soroban_sdk::String) {
    // Event emission simplified
}

pub fn bridge_cancelled(_env: &Env, _bridge_id: &soroban_sdk::String) {
    // Event emission simplified
}
