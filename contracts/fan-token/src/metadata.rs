use soroban_sdk::{Address, Env, String};

use crate::types::Error;
use crate::storage;

/// Metadata for a fan token
#[derive(Clone, Debug)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub frozen: bool,
}

/// Update fan token metadata (name and symbol)
///
/// Only the artist (token owner) can update metadata, and only if the token
/// is not frozen. Once frozen, metadata cannot be changed.
pub fn update_metadata(
    env: Env,
    artist: Address,
    name: String,
    symbol: String,
) -> Result<(), Error> {
    artist.require_auth();

    // Check if artist has a fan token
    if !storage::has_fan_token(&env, &artist) {
        return Err(Error::TokenNotFound);
    }

    // Get current token
    let mut fan_token = storage::get_fan_token(&env, &artist)
        .ok_or(Error::TokenNotFound)?;

    // Check if metadata is frozen
    if is_metadata_frozen(&env, &artist) {
        return Err(Error::MetadataFrozen);
    }

    // Validate new metadata
    if name.is_empty() || symbol.is_empty() {
        return Err(Error::InvalidMetadata);
    }

    // Update metadata
    fan_token.name = name;
    fan_token.symbol = symbol;

    storage::set_fan_token(&env, &artist, &fan_token);

    Ok(())
}

/// Freeze metadata for a fan token - prevents any future updates
///
/// Only the artist (token owner) can freeze metadata. Once frozen,
/// the metadata cannot be changed and the freeze cannot be reversed.
pub fn freeze_metadata(env: Env, artist: Address) -> Result<(), Error> {
    artist.require_auth();

    // Check if artist has a fan token
    if !storage::has_fan_token(&env, &artist) {
        return Err(Error::TokenNotFound);
    }

    // Check if already frozen
    if is_metadata_frozen(&env, &artist) {
        return Err(Error::MetadataFrozen);
    }

    // Set freeze flag in storage
    let storage_env = env.storage().persistent();
    storage_env.set(&get_freeze_key(&artist), &true);

    Ok(())
}

/// Check if metadata is frozen for a token
pub fn is_metadata_frozen(env: Env, artist: Address) -> bool {
    let storage = env.storage().persistent();
    storage.get::<String, bool>(&get_freeze_key(&artist))
        .unwrap_or(false)
}

/// Get the freeze status for display/queries
pub fn get_freeze_status(env: Env, artist: Address) -> bool {
    is_metadata_frozen(env, artist)
}

/// Helper to generate freeze storage key for an artist
fn get_freeze_key(artist: &Address) -> String {
    let artist_str = artist.to_string();
    format!("metadata_frozen:{}", artist_str)
}

/// Validate metadata update is allowed
pub fn validate_metadata_update(env: Env, artist: Address) -> Result<(), Error> {
    if is_metadata_frozen(env, artist) {
        return Err(Error::MetadataFrozen);
    }
    Ok(())
}
