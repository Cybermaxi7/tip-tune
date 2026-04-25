use soroban_sdk::{Env, String};

pub fn increment_proposal_count(env: &Env) -> u32 {
    let count: u32 = env.storage().instance().get(&String::from_str(&env, "count")).unwrap_or(0);
    let new_count = count + 1;
    env.storage().instance().set(&String::from_str(&env, "count"), &new_count);
    new_count
}
