#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use crate::types::{BridgeRecord, BridgeStatus};
use crate::errors::Error;

mod types;
mod storage;
mod errors;
mod event;

#[contract]
pub struct TipBridge;

#[contractimpl]
impl TipBridge {
    pub fn initialize(
        env: Env,
        admin: Address,
        _oracle: Address,
        _wrapped_token: Address,
        _fee_collector: Address,
        _fee_basis_points: u32,
        _min_amount: i128,
        _max_amount: i128,
        _bridge_ttl_ledgers: u32,
    ) -> Result<(), Error> {
        admin.require_auth();

        let config_key = String::from_str(&env, "config");
        if env.storage().instance().has(&config_key) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&config_key, &admin);
        Ok(())
    }

    pub fn initiate_bridge(
        env: Env,
        _source_chain: String,
        _sender: soroban_sdk::Bytes,
        recipient: Address,
        amount: i128,
    ) -> Result<String, Error> {
        recipient.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let bridge_count: u32 = env.storage().instance().get(&String::from_str(&env, "count")).unwrap_or(0);
        let new_count = bridge_count + 1;
        env.storage().instance().set(&String::from_str(&env, "count"), &new_count);

        let bridge_id = String::from_str(&env, "bridge");
        Ok(bridge_id)
    }

    pub fn submit_proof(
        env: Env,
        _bridge_id: String,
        _proof_data: soroban_sdk::Bytes,
    ) -> Result<(), Error> {
        let config_key = String::from_str(&env, "config");
        let _admin: Address = env.storage().instance().get(&config_key).ok_or(Error::NotInitialized)?;

        Ok(())
    }

    pub fn complete_bridge(
        env: Env,
        _bridge_id: String,
    ) -> Result<(), Error> {
        let config_key = String::from_str(&env, "config");
        let _admin: Address = env.storage().instance().get(&config_key).ok_or(Error::NotInitialized)?;

        Ok(())
    }

    pub fn cancel_bridge(
        env: Env,
        _bridge_id: String,
    ) -> Result<(), Error> {
        let config_key = String::from_str(&env, "config");
        let admin: Address = env.storage().instance().get(&config_key).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        Ok(())
    }

    pub fn initiate_bridge_back(
        env: Env,
        _destination_chain: String,
        sender: Address,
        _recipient: soroban_sdk::Bytes,
        amount: i128,
    ) -> Result<String, Error> {
        sender.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let bridge_id = String::from_str(&env, "bridge_back");
        Ok(bridge_id)
    }
}

#[cfg(test)]
mod test {
    #[test]
    fn test_placeholder() {
        assert_eq!(2 + 2, 4);
    }
}
