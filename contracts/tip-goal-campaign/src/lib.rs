#![no_std]

mod rent;
mod indexes;
mod storage;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String, Vec,
};
use crate::storage::{read_contributor_aggregate, write_contributor_aggregate, read_refund_claimed, set_refund_claimed};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    InvalidDeadline = 2,
    CampaignNotFound = 3,
    CampaignAlreadyFinalized = 4,
    CampaignNotExpired = 5,
    DeadlinePassed = 6,
    Unauthorized = 7,
    HardCapExceeded = 8,
    FundsAlreadyReleased = 9,
    RefundAlreadyClaimed = 10,
    NoContributionToRefund = 11,
    TransferFailed = 12,
}

/// The result when a campaign is finalized
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CampaignResult {
    GoalMet,
    GoalNotMet,
}

/// Status of a campaign
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    Active,
    Succeeded,
    Failed,
}

/// A single contribution record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contribution {
    pub contributor: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// Full campaign data
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub campaign_id: String,
    pub artist: Address,
    pub token: Address,
    pub goal_amount: i128,
    pub current_amount: i128,
    pub deadline: u64,
    pub status: CampaignStatus,
    pub contributions: Vec<Contribution>,
    pub created_at: u64,
    pub hard_cap: i128, // 0 means no cap; otherwise maximum total contributions allowed
    pub funds_released: bool, // true if success funds already transferred to artist
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Campaign(String),
    CampaignCount,
    UserContributions(Address),
    ContributorAggregate(String, Address),
    RefundClaimed(String, Address),
}

#[contract]
pub struct TipGoalCampaignContract;

#[contractimpl]
impl TipGoalCampaignContract {
    /// Create a new crowdfunding-style tip campaign with a goal and deadline
    /// token: address of the token accepted as contributions
    /// hard_cap: maximum total contributions allowed; 0 means no cap
    pub fn create_campaign(
        env: Env,
        artist: Address,
        token: Address,
        goal_amount: i128,
        deadline: u64,
        hard_cap: i128,
    ) -> Result<String, Error> {
        artist.require_auth();

        if goal_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if hard_cap < 0 {
            return Err(Error::InvalidAmount);
        }
        if hard_cap > 0 && hard_cap < goal_amount {
            // Hard cap must be at least the goal if set
            return Err(Error::InvalidAmount);
        }

        let current_time = env.ledger().timestamp();
        if deadline <= current_time {
            return Err(Error::InvalidDeadline);
        }

        // Generate campaign ID
        let mut counter: u32 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        counter += 1;
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &counter);

        let mut buf = [0u8; 10];
        let mut i = 10;
        let mut n = counter;
        if n == 0 {
            i -= 1;
            buf[i] = b'0';
        } else {
            while n > 0 {
                i -= 1;
                buf[i] = b'0' + (n % 10) as u8;
                n /= 10;
            }
        }
        let campaign_id = String::from_bytes(&env, &buf[i..]);

        let campaign = Campaign {
            campaign_id: campaign_id.clone(),
            artist: artist.clone(),
            token: token.clone(),
            goal_amount,
            current_amount: 0,
            deadline,
            status: CampaignStatus::Active,
            contributions: Vec::new(&env),
            created_at: current_time,
            hard_cap,
            funds_released: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id.clone()), &campaign);

        // Emit creation event
        env.events().publish(
            (symbol_short!("campaign"), symbol_short!("created")),
            (campaign_id.clone(), artist, token, goal_amount, deadline, hard_cap),
        );

        Ok(campaign_id)
    }

    /// Contribute to an active campaign with token transfer.
    /// Tokens are transferred from contributor to the contract's custody.
    pub fn contribute(
        env: Env,
        campaign_id: String,
        contributor: Address,
        amount: i128,
    ) -> Result<(), Error> {
        contributor.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id.clone()))
            .ok_or(Error::CampaignNotFound)?;

        if campaign.status != CampaignStatus::Active {
            return Err(Error::CampaignAlreadyFinalized);
        }

        let current_time = env.ledger().timestamp();
        if current_time > campaign.deadline {
            return Err(Error::DeadlinePassed);
        }

        // Check hard cap if set
        if campaign.hard_cap > 0 {
            let projected = campaign.current_amount + amount;
            if projected > campaign.hard_cap {
                return Err(Error::HardCapExceeded);
            }
        }

        // Transfer tokens from contributor to contract custody
        let token_client = token::Client::new(&env, &campaign.token);
        let contract_address = env.contract_id();
        let transfer_result = token_client.transfer(&contributor, &contract_address, &amount);
        if transfer_result.is_err() {
            return Err(Error::TransferFailed);
        }

        let contribution = Contribution {
            contributor: contributor.clone(),
            amount,
            timestamp: current_time,
        };

        campaign.contributions.push_back(contribution.clone());
        campaign.current_amount += amount;

        // Update contributor aggregate total
        let mut agg_total = read_contributor_aggregate(&env, &campaign_id, &contributor)
            .unwrap_or(0);
        agg_total += amount;
        write_contributor_aggregate(&env, &campaign_id, &contributor, &agg_total);

        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id.clone()), &campaign);

        // Update user contribution tracking (list of campaigns)
        let mut user_campaigns: Vec<String> = env
            .storage()
            .persistent()
            .get(&DataKey::UserContributions(contributor.clone()))
            .unwrap_or(Vec::new(&env));

        // Only add campaign_id if not already tracked
        let mut found = false;
        for existing in user_campaigns.iter() {
            if existing == campaign_id.clone() {
                found = true;
                break;
            }
        }
        if !found {
            user_campaigns.push_back(campaign_id.clone());
            env.storage().persistent().set(
                &DataKey::UserContributions(contributor.clone()),
                &user_campaigns,
            );
        }

        // Emit contribution event
        env.events().publish(
            (symbol_short!("campaign"), symbol_short!("contrib")),
            (campaign_id, contributor, amount),
        );

        Ok(())
    }

    /// Finalize a campaign: release funds to artist if goal met, or mark as failed for refunds
    pub fn finalize_campaign(env: Env, campaign_id: String) -> Result<CampaignResult, Error> {
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id.clone()))
            .ok_or(Error::CampaignNotFound)?;

        if campaign.status != CampaignStatus::Active {
            return Err(Error::CampaignAlreadyFinalized);
        }

        let current_time = env.ledger().timestamp();
        if current_time <= campaign.deadline {
            // Allow early finalization only if goal is already met
            if campaign.current_amount < campaign.goal_amount {
                return Err(Error::CampaignNotExpired);
            }
        }

        let result = if campaign.current_amount >= campaign.goal_amount {
            // Campaign succeeded: transfer funds to artist
            let token_client = token::Client::new(&env, &campaign.token);
            let contract_addr = env.contract_id();
            let transfer_result = token_client.transfer(&contract_addr, &campaign.artist, &campaign.current_amount);
            if transfer_result.is_err() {
                return Err(Error::TransferFailed);
            }
            campaign.funds_released = true;
            campaign.status = CampaignStatus::Succeeded;
            CampaignResult::GoalMet
        } else {
            campaign.status = CampaignStatus::Failed;
            CampaignResult::GoalNotMet
        };

        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id.clone()), &campaign);

        // Emit finalization event
        env.events().publish(
            (symbol_short!("campaign"), symbol_short!("final")),
            (campaign_id, result),
        );

        Ok(result)
    }

    /// Get campaign details
    pub fn get_campaign(env: Env, campaign_id: String) -> Result<Campaign, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .ok_or(Error::CampaignNotFound)
    }

    /// Get campaigns a user has contributed to
    pub fn get_user_campaigns(env: Env, user: Address) -> Vec<String> {
        env.storage()
            .persistent()
            .get(&DataKey::UserContributions(user))
            .unwrap_or(Vec::new(&env))
    }

    /// Get the total number of campaigns created
    pub fn get_campaign_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    /// Get the total amount contributed by a specific contributor to a campaign.
    /// This is an aggregate that doesn't require scanning contribution history.
    pub fn get_contributor_total(env: Env, campaign_id: String, contributor: Address) -> i128 {
        read_contributor_aggregate(&env, &campaign_id, &contributor).unwrap_or(0)
    }

    /// Claim a refund for a failed campaign.
    /// Only contributors who have contributed can claim, and only once.
    pub fn claim_refund(env: Env, campaign_id: String, contributor: Address) -> Result<(), Error> {
        contributor.require_auth();

        let campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id.clone()))
            .ok_or(Error::CampaignNotFound)?;

        if campaign.status != CampaignStatus::Failed {
            return Err(Error::CampaignNotExpired);
        }

        if read_refund_claimed(&env, &campaign_id, &contributor) {
            return Err(Error::RefundAlreadyClaimed);
        }

        let total = read_contributor_aggregate(&env, &campaign_id, &contributor)
            .ok_or(Error::NoContributionToRefund)?;

        if total <= 0 {
            return Err(Error::NoContributionToRefund);
        }

        // Transfer from contract to contributor
        let token_client = token::Client::new(&env, &campaign.token);
        let contract_addr = env.contract_id();
        let result = token_client.transfer(&contract_addr, &contributor, &total);
        if result.is_err() {
            return Err(Error::TransferFailed);
        }

        set_refund_claimed(&env, &campaign_id, &contributor);

        env.events().publish(
            (symbol_short!("campaign"), symbol_short!("refund")),
            (campaign_id, contributor, total),
        );

        Ok(())
    }

    /// Get whether a contributor has already claimed their refund.
    pub fn has_contributor_claimed_refund(env: Env, campaign_id: String, contributor: Address) -> bool {
        read_refund_claimed(&env, &campaign_id, &contributor)
    }
}

mod test;
