#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use crate::types::ProposalStatus;
use crate::errors::Error;

mod types;
mod storage;
mod errors;
mod event;

#[contract]
pub struct Governance;

#[contractimpl]
impl Governance {
    pub fn initialize(
        env: Env,
        admin: Address,
        _token: Address,
        _voting_period_ledgers: u32,
        _timelock_ledgers: u32,
        _quorum_basis_points: u32,
        _proposal_threshold: i128,
    ) -> Result<(), Error> {
        admin.require_auth();

        let config_key = String::from_str(&env, "config");
        if env.storage().instance().has(&config_key) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&config_key, &admin);
        Ok(())
    }

    pub fn create_proposal(
        env: Env,
        proposer: Address,
        description: String,
        _actions: soroban_sdk::Vec<soroban_sdk::Address>,
    ) -> Result<String, Error> {
        proposer.require_auth();

        if description.len() == 0 {
            return Err(Error::InvalidDescription);
        }

        let prop_count: u32 = env.storage().instance().get(&String::from_str(&env, "count")).unwrap_or(0);
        let new_count = prop_count + 1;
        env.storage().instance().set(&String::from_str(&env, "count"), &new_count);

        let proposal_id = String::from_str(&env, "proposal");

        event::proposal_created(&env, &proposal_id, &proposer);

        Ok(proposal_id)
    }

    pub fn vote(
        env: Env,
        voter: Address,
        _proposal_id: String,
        _support: bool,
    ) -> Result<(), Error> {
        voter.require_auth();
        Ok(())
    }

    pub fn finalize_proposal(
        env: Env,
        _proposal_id: String,
    ) -> Result<(), Error> {
        let config_key = String::from_str(&env, "config");
        let _admin: Address = env.storage().instance().get(&config_key).ok_or(Error::NotInitialized)?;

        Ok(())
    }

    pub fn execute_proposal(
        env: Env,
        _proposal_id: String,
    ) -> Result<(), Error> {
        let config_key = String::from_str(&env, "config");
        let _admin: Address = env.storage().instance().get(&config_key).ok_or(Error::NotInitialized)?;

        Ok(())
    }

    pub fn delegate(
        env: Env,
        delegator: Address,
        delegatee: Address,
    ) -> Result<(), Error> {
        delegator.require_auth();

        if delegator == delegatee {
            return Err(Error::SelfDelegation);
        }

        event::delegation_created(&env, &delegator, &delegatee);

        Ok(())
    }
}

#[cfg(test)]
mod test {
    #[test]
    fn test_placeholder() {
        assert_eq!(2 + 2, 4);
    }
}
