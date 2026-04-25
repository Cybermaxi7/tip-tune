use soroban_sdk::{contracttype, Address, Env};

use crate::types::Error;

// ── Storage keys ─────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum AccessKey {
    /// Per-artist set of trusted minter addresses
    TrustedMinter(Address, Address), // (artist, minter)
}

// ── Trusted-minter helpers ───────────────────────────────────────────

/// Check whether `minter` is a trusted minter for `artist`.
pub fn is_trusted_minter(env: &Env, artist: &Address, minter: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&AccessKey::TrustedMinter(artist.clone(), minter.clone()))
}

/// Add `minter` as a trusted minter for `artist`. Caller must be the artist.
pub fn add_trusted_minter(env: &Env, artist: &Address, minter: &Address) -> Result<(), Error> {
    artist.require_auth();
    if is_trusted_minter(env, artist, minter) {
        return Err(Error::AlreadyTrustedMinter);
    }
    env.storage()
        .persistent()
        .set(&AccessKey::TrustedMinter(artist.clone(), minter.clone()), &true);
    Ok(())
}

/// Remove `minter` as a trusted minter for `artist`. Caller must be the artist.
pub fn remove_trusted_minter(env: &Env, artist: &Address, minter: &Address) -> Result<(), Error> {
    artist.require_auth();
    if !is_trusted_minter(env, artist, minter) {
        return Err(Error::NotTrustedMinter);
    }
    env.storage()
        .persistent()
        .remove(&AccessKey::TrustedMinter(artist.clone(), minter.clone()));
    Ok(())
}

/// Verify that `caller` is either the artist themselves or a trusted minter
/// for the given artist. Returns `Ok(())` if authorized, `Err` otherwise.
pub fn require_artist_or_trusted(env: &Env, artist: &Address, caller: &Address) -> Result<(), Error> {
    if caller == artist {
        caller.require_auth();
        return Ok(());
    }
    if is_trusted_minter(env, artist, caller) {
        caller.require_auth();
        return Ok(());
    }
    Err(Error::Unauthorized)
}
