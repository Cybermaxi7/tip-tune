use soroban_sdk::{contracttype, Env, Address, String};

use crate::DataKey;

/// Read contributor aggregate total for a campaign.
/// Returns None if no contributions recorded.
pub fn read_contributor_aggregate(env: &Env, campaign_id: &String, contributor: &Address) -> Option<i128> {
    let key = DataKey::ContributorAggregate(campaign_id.clone(), contributor.clone());
    env.storage().persistent().get(&key)
}

/// Write contributor aggregate total for a campaign.
pub fn write_contributor_aggregate(env: &Env, campaign_id: &String, contributor: &Address, total: &i128) {
    let key = DataKey::ContributorAggregate(campaign_id.clone(), contributor.clone());
    env.storage().persistent().set(&key, total);
}

/// Check if a contributor has already claimed a refund for a campaign.
pub fn read_refund_claimed(env: &Env, campaign_id: &String, contributor: &Address) -> bool {
    let key = DataKey::RefundClaimed(campaign_id.clone(), contributor.clone());
    env.storage().persistent().get(&key).unwrap_or(false)
}

/// Mark refund as claimed for a contributor.
pub fn set_refund_claimed(env: &Env, campaign_id: &String, contributor: &Address) {
    let key = DataKey::RefundClaimed(campaign_id.clone(), contributor.clone());
    env.storage().persistent().set(&key, &true);
}
