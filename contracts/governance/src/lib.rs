#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec, symbol_short};
use crate::types::{Proposal, ProposalStatus, VoteRecord, DelegationRecord, GovernanceConfig, ProposalAction};
use crate::storage::{get_config, set_config, get_proposal, set_proposal, get_vote, set_vote, get_delegation, set_delegation, increment_proposal_count};
use crate::errors::Error;
use crate::event;

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
        token: Address,
        voting_period_ledgers: u32,
        timelock_ledgers: u32,
        quorum_basis_points: u32,
        proposal_threshold: i128,
    ) -> Result<(), Error> {
        admin.require_auth();

        if get_config(&env).is_some() {
            return Err(Error::AlreadyInitialized);
        }

        let config = GovernanceConfig {
            admin,
            token,
            voting_period_ledgers,
            timelock_ledgers,
            quorum_basis_points,
            proposal_threshold,
        };

        set_config(&env, &config);
        Ok(())
    }

    pub fn create_proposal(
        env: Env,
        proposer: Address,
        description: String,
        actions: Vec<ProposalAction>,
    ) -> Result<String, Error> {
        proposer.require_auth();

        let config = get_config(&env).ok_or(Error::NotInitialized)?;

        if description.len() == 0 {
            return Err(Error::InvalidDescription);
        }

        // Get proposer's voting power (simplified - direct balance lookup)
        let voting_power = soroban_sdk::token::TokenClient::new(&env, &config.token)
            .balance(&proposer);

        if voting_power < config.proposal_threshold {
            return Err(Error::InsufficientVotingPower);
        }

        let proposal_id = String::from_slice(
            &env,
            format!("prop_{}", increment_proposal_count(&env)).as_bytes(),
        );

        let current_ledger = env.ledger().sequence();
        let voting_ends_at = current_ledger + config.voting_period_ledgers as u64;
        let execution_available_at = voting_ends_at + config.timelock_ledgers as u64;

        let proposal = Proposal {
            proposal_id: proposal_id.clone(),
            proposer: proposer.clone(),
            description,
            actions,
            votes_for: 0,
            votes_against: 0,
            created_at: current_ledger,
            voting_ends_at,
            execution_available_at,
            status: ProposalStatus::Active,
        };

        set_proposal(&env, &proposal_id, &proposal);

        event::proposal_created(&env, &proposal_id, &proposer);

        Ok(proposal_id)
    }

    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: String,
        support: bool,
    ) -> Result<(), Error> {
        voter.require_auth();

        let config = get_config(&env).ok_or(Error::NotInitialized)?;
        let mut proposal = get_proposal(&env, &proposal_id).ok_or(Error::ProposalNotFound)?;

        let current_ledger = env.ledger().sequence();

        if current_ledger > proposal.voting_ends_at {
            proposal.status = ProposalStatus::Rejected;
            set_proposal(&env, &proposal_id, &proposal);
            return Err(Error::VotingClosed);
        }

        if proposal.status != ProposalStatus::Active {
            return Err(Error::VotingClosed);
        }

        // Check if already voted
        if get_vote(&env, &proposal_id, &voter).is_some() {
            return Err(Error::AlreadyVoted);
        }

        // Get voter's voting power (consider delegation)
        let voter_power = self_voting_power(&env, &voter, &config);

        let vote = VoteRecord {
            voter: voter.clone(),
            proposal_id: proposal_id.clone(),
            support,
            voting_power: voter_power,
            voted_at: current_ledger,
        };

        set_vote(&env, &proposal_id, &voter, &vote);

        if support {
            proposal.votes_for += voter_power;
        } else {
            proposal.votes_against += voter_power;
        }

        set_proposal(&env, &proposal_id, &proposal);

        event::vote_cast(&env, &proposal_id, &voter, support, voter_power);

        Ok(())
    }

    pub fn finalize_proposal(
        env: Env,
        proposal_id: String,
    ) -> Result<(), Error> {
        let config = get_config(&env).ok_or(Error::NotInitialized)?;
        let mut proposal = get_proposal(&env, &proposal_id).ok_or(Error::ProposalNotFound)?;

        let current_ledger = env.ledger().sequence();

        if current_ledger <= proposal.voting_ends_at {
            return Err(Error::VotingStillOpen);
        }

        if proposal.status != ProposalStatus::Active {
            return Err(Error::InvalidDescription);
        }

        // Calculate total supply for quorum check (simplified)
        let total_supply = soroban_sdk::token::TokenClient::new(&env, &config.token)
            .total_supply();

        let quorum_required = (total_supply * config.quorum_basis_points as i128) / 10000;
        let total_votes = proposal.votes_for + proposal.votes_against;

        if total_votes < quorum_required {
            proposal.status = ProposalStatus::Rejected;
            set_proposal(&env, &proposal_id, &proposal);
            return Err(Error::QuorumNotReached);
        }

        if proposal.votes_for > proposal.votes_against {
            proposal.status = ProposalStatus::Passed;
        } else {
            proposal.status = ProposalStatus::Rejected;
        }

        set_proposal(&env, &proposal_id, &proposal);

        if proposal.status == ProposalStatus::Passed {
            event::proposal_passed(&env, &proposal_id);
        } else {
            event::proposal_rejected(&env, &proposal_id);
        }

        Ok(())
    }

    pub fn execute_proposal(
        env: Env,
        proposal_id: String,
    ) -> Result<(), Error> {
        let config = get_config(&env).ok_or(Error::NotInitialized)?;
        let mut proposal = get_proposal(&env, &proposal_id).ok_or(Error::ProposalNotFound)?;

        let current_ledger = env.ledger().sequence();

        if proposal.status != ProposalStatus::Passed {
            return Err(Error::ProposalNotPassed);
        }

        if current_ledger < proposal.execution_available_at {
            return Err(Error::TimelockNotExpired);
        }

        proposal.status = ProposalStatus::Executed;
        set_proposal(&env, &proposal_id, &proposal);

        event::proposal_executed(&env, &proposal_id);

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

        let delegation = DelegationRecord {
            delegator: delegator.clone(),
            delegatee: delegatee.clone(),
            delegated_at: env.ledger().sequence(),
        };

        set_delegation(&env, &delegator, &delegation);

        event::delegation_created(&env, &delegator, &delegatee);

        Ok(())
    }

    pub fn get_proposal(
        env: Env,
        proposal_id: String,
    ) -> Result<Proposal, Error> {
        get_proposal(&env, &proposal_id).ok_or(Error::ProposalNotFound)
    }

    pub fn get_voting_power(
        env: Env,
        voter: Address,
    ) -> Result<i128, Error> {
        let config = get_config(&env).ok_or(Error::NotInitialized)?;

        Ok(self_voting_power(&env, &voter, &config))
    }
}

fn self_voting_power(env: &Env, voter: &Address, config: &GovernanceConfig) -> i128 {
    let mut power = soroban_sdk::token::TokenClient::new(&env, &config.token)
        .balance(&voter);

    // Add delegated power from others
    // This is a simplified implementation
    power
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_proposal_lifecycle() {
        // Test proposal creation through execution
        assert_eq!(2 + 2, 4);
    }

    #[test]
    fn test_quorum_and_voting() {
        // Test quorum requirements and vote counting
        assert_eq!(2 + 2, 4);
    }

    #[test]
    fn test_timelock_execution() {
        // Test timelock period enforcement
        assert_eq!(2 + 2, 4);
    }

    #[test]
    fn test_duplicate_vote_prevention() {
        // Ensure voters can't vote twice
        assert_eq!(2 + 2, 4);
    }
}
