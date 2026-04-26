use soroban_sdk::{token, Address, Env};

pub fn deposit(env: &Env, token: &Address, from: &Address, amount: i128) {
    token::Client::new(env, token).transfer(from, &env.current_contract_address(), &amount);
}

pub fn withdraw(env: &Env, token: &Address, to: &Address, amount: i128) {
    token::Client::new(env, token).transfer(&env.current_contract_address(), to, &amount);
}
