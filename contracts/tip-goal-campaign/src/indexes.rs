use soroban_sdk::{Address, Env, String, Vec};

use crate::{Campaign, CampaignStatus, DataKey};

/// Index keys for efficient querying
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IndexKey {
    CampaignsByArtist(Address),  // Maps artist -> list of campaign IDs
    ActiveCampaigns,              // List of all active campaign IDs
}

/// Add a campaign to the artist's index
pub fn add_to_artist_index(env: Env, artist: Address, campaign_id: String) {
    let storage = env.storage().persistent();
    let artist_key = IndexKey::CampaignsByArtist(artist.clone());

    let mut campaigns = storage.get::<IndexKey, Vec<String>>(&artist_key)
        .unwrap_or_else(|| Vec::new(&env));

    campaigns.push_back(campaign_id);
    storage.set(&artist_key, &campaigns);
}

/// Add a campaign to the active campaigns index
pub fn add_to_active_index(env: Env, campaign_id: String) {
    let storage = env.storage().persistent();

    let mut active_campaigns = storage.get::<IndexKey, Vec<String>>(&IndexKey::ActiveCampaigns)
        .unwrap_or_else(|| Vec::new(&env));

    active_campaigns.push_back(campaign_id);
    storage.set(&IndexKey::ActiveCampaigns, &active_campaigns);
}

/// Remove a campaign from the active campaigns index
pub fn remove_from_active_index(env: Env, campaign_id: String) {
    let storage = env.storage().persistent();

    if let Some(mut active_campaigns) = storage.get::<IndexKey, Vec<String>>(&IndexKey::ActiveCampaigns) {
        // Find and remove the campaign ID
        for i in 0..active_campaigns.len() {
            if active_campaigns.get(i).unwrap() == campaign_id {
                // Remove by swapping with last and popping
                let last = active_campaigns.pop_back().unwrap();
                if i < active_campaigns.len() {
                    active_campaigns.set(i, last);
                }
                break;
            }
        }
        storage.set(&IndexKey::ActiveCampaigns, &active_campaigns);
    }
}

/// Get all campaigns for an artist
pub fn get_campaigns_by_artist(env: Env, artist: Address) -> Vec<String> {
    let storage = env.storage().persistent();
    let artist_key = IndexKey::CampaignsByArtist(artist);

    storage.get::<IndexKey, Vec<String>>(&artist_key)
        .unwrap_or_else(|| Vec::new(&env))
}

/// Get all active campaigns
pub fn get_active_campaigns(env: Env) -> Vec<String> {
    let storage = env.storage().persistent();

    storage.get::<IndexKey, Vec<String>>(&IndexKey::ActiveCampaigns)
        .unwrap_or_else(|| Vec::new(&env))
}

/// Handle campaign finalization - remove from active index
pub fn handle_finalize(env: Env, campaign_id: String) {
    remove_from_active_index(env, campaign_id);
}

/// Verify campaign is in active index
pub fn is_campaign_active_indexed(env: Env, campaign_id: String) -> bool {
    let storage = env.storage().persistent();

    if let Some(active_campaigns) = storage.get::<IndexKey, Vec<String>>(&IndexKey::ActiveCampaigns) {
        for campaign_id_in_index in active_campaigns.iter() {
            if campaign_id_in_index == campaign_id {
                return true;
            }
        }
    }
    false
}

/// Get campaigns by artist with pagination
pub fn get_artist_campaigns_paginated(
    env: Env,
    artist: Address,
    page: u32,
    page_size: u32,
) -> Vec<String> {
    if page_size == 0 || page_size > 100 {
        return Vec::new(&env);
    }

    let all_campaigns = get_campaigns_by_artist(env.clone(), artist);
    let start = (page * page_size) as usize;
    let end = ((page + 1) * page_size) as usize;

    let mut result = Vec::new(&env);
    for i in start..end.min(all_campaigns.len()) {
        if let Some(campaign_id) = all_campaigns.get(i as u32) {
            result.push_back(campaign_id);
        }
    }
    result
}

/// Get active campaigns with pagination
pub fn get_active_campaigns_paginated(
    env: Env,
    page: u32,
    page_size: u32,
) -> Vec<String> {
    if page_size == 0 || page_size > 100 {
        return Vec::new(&env);
    }

    let all_campaigns = get_active_campaigns(env.clone());
    let start = (page * page_size) as usize;
    let end = ((page + 1) * page_size) as usize;

    let mut result = Vec::new(&env);
    for i in start..end.min(all_campaigns.len()) {
        if let Some(campaign_id) = all_campaigns.get(i as u32) {
            result.push_back(campaign_id);
        }
    }
    result
}
