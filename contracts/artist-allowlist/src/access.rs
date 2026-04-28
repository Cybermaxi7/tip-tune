use soroban_sdk::{Address, Env};

use crate::Error;

pub fn require_artist_or_manager(env: &Env, artist: &Address, caller: &Address) -> Result<(), Error> {
    caller.require_auth();
    if caller == artist || crate::storage::is_manager(env, artist, caller) {
        return Ok(());
    }
    Err(Error::Unauthorized)
}
