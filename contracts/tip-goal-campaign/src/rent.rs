use soroban_sdk::{Address, Env, String};

use crate::{Campaign, CampaignStatus, DataKey};

/// TTL constant for active campaigns (in seconds, e.g., 30 days)
const ACTIVE_CAMPAIGN_TTL: u32 = 30 * 24 * 60 * 60;

/// TTL constant for finalized campaigns (in seconds, e.g., 90 days)
const FINALIZED_CAMPAIGN_TTL: u32 = 90 * 24 * 60 * 60;

/// Refresh TTL for an active campaign to keep it rent-safe
pub fn refresh_campaign_ttl(env: Env, campaign_id: String) -> bool {
    let storage = env.storage().persistent();

    if let Some(mut campaign) = storage.get::<DataKey, Campaign>(&DataKey::Campaign(campaign_id.clone())) {
        match campaign.status {
            CampaignStatus::Active => {
                // Extend TTL for active campaigns
                storage.extend_ttl(&DataKey::Campaign(campaign_id), ACTIVE_CAMPAIGN_TTL, ACTIVE_CAMPAIGN_TTL);
                true
            }
            CampaignStatus::Succeeded | CampaignStatus::Failed => {
                // Extend TTL for finalized campaigns
                storage.extend_ttl(&DataKey::Campaign(campaign_id), FINALIZED_CAMPAIGN_TTL, FINALIZED_CAMPAIGN_TTL);
                true
            }
        }
    } else {
        false
    }
}

/// Refresh TTL for contributor index to keep rent-safe
pub fn refresh_contributor_ttl(env: Env, contributor: Address) {
    let storage = env.storage().persistent();
    storage.extend_ttl(&DataKey::UserContributions(contributor), ACTIVE_CAMPAIGN_TTL, ACTIVE_CAMPAIGN_TTL);
}

/// Set initial TTL when creating a campaign
pub fn set_campaign_initial_ttl(env: Env, campaign_id: String) {
    let storage = env.storage().persistent();
    storage.extend_ttl(&DataKey::Campaign(campaign_id), ACTIVE_CAMPAIGN_TTL, ACTIVE_CAMPAIGN_TTL);
}

/// Update TTL when campaign is finalized
pub fn update_finalized_campaign_ttl(env: Env, campaign_id: String) {
    let storage = env.storage().persistent();
    storage.extend_ttl(&DataKey::Campaign(campaign_id), FINALIZED_CAMPAIGN_TTL, FINALIZED_CAMPAIGN_TTL);
}

/// Get current TTL remaining for a campaign (for monitoring)
pub fn get_campaign_ttl(env: Env, campaign_id: String) -> Option<u32> {
    let storage = env.storage().persistent();

    if let Some(campaign) = storage.get::<DataKey, Campaign>(&DataKey::Campaign(campaign_id)) {
        let expected_ttl = match campaign.status {
            CampaignStatus::Active => ACTIVE_CAMPAIGN_TTL,
            CampaignStatus::Succeeded | CampaignStatus::Failed => FINALIZED_CAMPAIGN_TTL,
        };
        Some(expected_ttl)
    } else {
        None
    }
}

/// Refresh all campaigns and contributor indexes to prevent rent collection
pub fn refresh_all_active_ttls(env: Env, campaign_ids: Vec<String>, contributors: Vec<Address>) {
    // Refresh campaigns
    for campaign_id in campaign_ids.iter() {
        refresh_campaign_ttl(env.clone(), campaign_id.clone());
    }

    // Refresh contributor indexes
    for contributor in contributors.iter() {
        refresh_contributor_ttl(env.clone(), contributor.clone());
    }
}
