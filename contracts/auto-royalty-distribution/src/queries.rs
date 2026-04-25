use soroban_sdk::{Address, Env, String, Vec};

use crate::{DistributionRecord, Error, DataKey};

/// Fetch all settlement records for a given payout ID
pub fn get_settlements_by_payout_id(
    env: Env,
    payout_id: String,
) -> Result<Vec<DistributionRecord>, Error> {
    let storage = env.storage().instance();
    let mut settlements = Vec::new();

    // Iterate through all distribution logs to find records matching the payout_id
    if let Some(global_count) = storage.get::<DataKey, u32>(&DataKey::GlobalLogCount) {
        for i in 0..global_count {
            // We need to check each track's logs, but since payout_id is global,
            // we look for matching records across all tracks
            for key in storage.keys().iter() {
                if let Ok(record) = storage.get::<DataKey, DistributionRecord>(key) {
                    if record.payout_id == payout_id {
                        settlements.push(record);
                    }
                }
            }
        }
    }

    Ok(settlements)
}

/// Fetch paginated recent settlements for a track
pub fn get_recent_settlements(
    env: Env,
    track_id: String,
    page: u32,
    page_size: u32,
) -> Result<Vec<DistributionRecord>, Error> {
    if page_size == 0 || page_size > 100 {
        return Err(Error::InvalidAmount);
    }

    let storage = env.storage().instance();
    let mut settlements = Vec::new();

    if let Some(log_count) = storage.get::<DataKey, u32>(&DataKey::LogCount(track_id.clone())) {
        // Calculate pagination bounds (in reverse chronological order)
        let start = log_count.saturating_sub((page + 1) * page_size);
        let end = log_count.saturating_sub(page * page_size);

        for i in start..end {
            if let Some(record) = storage.get::<DataKey, DistributionRecord>(&DataKey::DistributionLog(track_id.clone(), i)) {
                settlements.push(record);
            }
        }
    }

    Ok(settlements)
}

/// Check if a settlement has been recorded for a payout
pub fn is_settled(env: Env, payout_id: String) -> bool {
    let storage = env.storage().instance();
    storage.get::<DataKey, bool>(&DataKey::Settled(payout_id))
        .unwrap_or(false)
}

/// Get total settlement count for a track
pub fn get_track_settlement_count(env: Env, track_id: String) -> u32 {
    let storage = env.storage().instance();
    storage.get::<DataKey, u32>(&DataKey::LogCount(track_id))
        .unwrap_or(0)
}
