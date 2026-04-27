//! Secondary indexes for tip-verification contract.
//! Provides efficient lookup by tx_hash and artist.

use crate::DataKey;
use soroban_sdk::{Address, Env, String};

/// Index from tx_hash to tip_id for O(1) lookup by transaction hash.
pub fn set_tx_hash_to_tip_id(env: &Env, tx_hash: &String, tip_id: &String) {
    env.storage()
        .persistent()
        .set(&DataKey::TxHashToTipId(tx_hash.clone()), tip_id);
}

/// Get tip_id by tx_hash. Returns None if not found.
pub fn get_tip_id_by_tx_hash(env: &Env, tx_hash: &String) -> Option<String> {
    env.storage()
        .persistent()
        .get(&DataKey::TxHashToTipId(tx_hash.clone()))
}

/// Index from artist address to tip count (for iteration).
/// We store a counter and use indexed storage for enumeration.
pub fn set_artist_tip_count(env: &Env, artist: &Address, count: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::ArtistTipCount(artist.clone()), &count);
}

/// Get tip count for an artist.
pub fn get_artist_tip_count(env: &Env, artist: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::ArtistTipCount(artist.clone()))
        .unwrap_or(0)
}

/// Store a tip ID at a specific index for an artist.
/// This allows enumeration of tips for a given artist.
pub fn set_artist_tip_at_index(env: &Env, artist: &Address, index: u32, tip_id: &String) {
    env.storage()
        .persistent()
        .set(&DataKey::ArtistTipIndex(artist.clone(), index), tip_id);
}

/// Get tip ID at a specific index for an artist.
pub fn get_artist_tip_at_index(env: &Env, artist: &Address, index: u32) -> Option<String> {
    env.storage()
        .persistent()
        .get(&DataKey::ArtistTipIndex(artist.clone(), index))
}

/// Add a tip to an artist's index.
/// Returns the new tip count for the artist.
pub fn add_tip_to_artist_index(env: &Env, artist: &Address, tip_id: &String) -> u32 {
    let current_count = get_artist_tip_count(env, artist);
    let new_count = current_count + 1;

    // Store the tip at the new index
    set_artist_tip_at_index(env, artist, current_count, tip_id);

    // Update the count
    set_artist_tip_count(env, artist, new_count);

    new_count
}

/// Check if a tx_hash is already indexed (duplicate).
pub fn has_tx_hash_index(env: &Env, tx_hash: &String) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::TxHashToTipId(tx_hash.clone()))
}