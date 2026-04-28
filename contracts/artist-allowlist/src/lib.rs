#![no_std]

mod access;
mod indexes;
mod storage;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    ConfigNotFound = 2,
    AlreadyOnAllowlist = 3,
    NotOnAllowlist = 4,
    InvalidTokenConfig = 5,
    TokenGateNotFound = 6,
    EmptyBatchOperation = 7,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AllowlistMode {
    Open,
    AllowlistOnly,
    TokenGated,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistConfig {
    pub artist: Address,
    pub mode: AllowlistMode,
    pub is_active: bool,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistEntry {
    pub artist: Address,
    pub address: Address,
    pub added_at: u64,
    pub added_by: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenGateConfig {
    pub token_address: Address,
    pub min_balance: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Config(Address),
    Entry(Address, Address),
    TokenGate(Address),
    Manager(Address, Address),
}

#[contract]
pub struct ArtistAllowlistContract;

#[contractimpl]
impl ArtistAllowlistContract {
    pub fn set_manager(
        env: Env,
        artist: Address,
        manager: Address,
        enabled: bool,
    ) -> Result<(), Error> {
        artist.require_auth();
        storage::set_manager(&env, &artist, &manager, enabled);
        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("manager")),
            (artist, manager, enabled),
        );
        Ok(())
    }

    pub fn is_manager(env: Env, artist: Address, manager: Address) -> bool {
        storage::is_manager(&env, &artist, &manager)
    }

    /// Set or update the allowlist mode for an artist
    pub fn set_allowlist_mode(
        env: Env,
        artist: Address,
        caller: Address,
        mode: AllowlistMode,
    ) -> Result<(), Error> {
        access::require_artist_or_manager(&env, &artist, &caller)?;
        let config: AllowlistConfig = match storage::get_config(&env, &artist) {
            Some(existing) => AllowlistConfig { mode, ..existing },
            None => AllowlistConfig {
                artist: artist.clone(),
                mode,
                is_active: true,
                created_at: env.ledger().timestamp(),
            },
        };
        storage::set_config(&env, &artist, &config);

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("mode")),
            (artist, caller, mode),
        );

        Ok(())
    }

    /// Configure token gate parameters for token-gated mode.
    /// Validates that the token address is currently valid.
    pub fn set_token_gate(
        env: Env,
        artist: Address,
        caller: Address,
        token_address: Address,
        min_balance: i128,
    ) -> Result<(), Error> {
        access::require_artist_or_manager(&env, &artist, &caller)?;

        if min_balance <= 0 {
            return Err(Error::InvalidTokenConfig);
        }

        // Validate token configuration by attempting to create a client
        // This ensures the token address is callable and valid
        let _client = token::Client::new(&env, &token_address);

        let gate = TokenGateConfig {
            token_address,
            min_balance,
        };

        storage::set_token_gate(&env, &artist, &gate);

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("tkngate")),
            (artist, caller, min_balance),
        );

        Ok(())
    }

    /// Add an address to an artist's allowlist
    pub fn add_to_allowlist(
        env: Env,
        artist: Address,
        caller: Address,
        address: Address,
    ) -> Result<(), Error> {
        access::require_artist_or_manager(&env, &artist, &caller)?;
        if storage::has_entry(&env, &artist, &address) {
            return Err(Error::AlreadyOnAllowlist);
        }

        let entry = AllowlistEntry {
            artist: artist.clone(),
            address: address.clone(),
            added_at: env.ledger().timestamp(),
            added_by: caller.clone(),
        };
        storage::set_entry(&env, &artist, &address, &entry);

        indexes::add_to_index(&env, &artist, &address);

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("added")),
            (artist, caller, address),
        );

        Ok(())
    }

    /// Remove an address from an artist's allowlist
    pub fn remove_from_allowlist(
        env: Env,
        artist: Address,
        caller: Address,
        address: Address,
    ) -> Result<(), Error> {
        access::require_artist_or_manager(&env, &artist, &caller)?;
        if !storage::has_entry(&env, &artist, &address) {
            return Err(Error::NotOnAllowlist);
        }
        storage::remove_entry(&env, &artist, &address);

        indexes::remove_from_index(&env, &artist, &address);

        env.events().publish(
            (symbol_short!("allowlst"), symbol_short!("removed")),
            (artist, caller, address),
        );

        Ok(())
    }

    /// Check if a tipper is allowed to tip an artist
    pub fn check_can_tip(env: Env, artist: Address, tipper: Address) -> bool {
        let config: AllowlistConfig = match storage::get_config(&env, &artist) {
            Some(c) => c,
            None => return true,
        };

        if !config.is_active {
            return true;
        }

        match config.mode {
            AllowlistMode::Open => true,
            AllowlistMode::AllowlistOnly => storage::has_entry(&env, &artist, &tipper),
            AllowlistMode::TokenGated => {
                let gate: TokenGateConfig = match storage::get_token_gate(&env, &artist) {
                    Some(g) => g,
                    None => return false,
                };
                let client = token::Client::new(&env, &gate.token_address);
                client.balance(&tipper) >= gate.min_balance
            }
        }
    }

    /// Get the current allowlist config for an artist
    pub fn get_config(env: Env, artist: Address) -> Result<AllowlistConfig, Error> {
        storage::get_config(&env, &artist).ok_or(Error::ConfigNotFound)
    }

    /// Check if an address is on the allowlist
    pub fn is_on_allowlist(env: Env, artist: Address, address: Address) -> bool {
        storage::has_entry(&env, &artist, &address)
    }

    /// Add multiple addresses to an artist's allowlist in a batch operation.
    /// Fails if any address is already on the allowlist (atomic semantics).
    pub fn add_batch_to_allowlist(
        env: Env,
        artist: Address,
        caller: Address,
        addresses: Vec<Address>,
    ) -> Result<(), Error> {
        access::require_artist_or_manager(&env, &artist, &caller)?;

        if addresses.is_empty() {
            return Err(Error::EmptyBatchOperation);
        }

        // Check for duplicates within the batch
        let len = addresses.len();
        for i in 0..len {
            for j in (i + 1)..len {
                if addresses.get(i).unwrap() == addresses.get(j).unwrap() {
                    return Err(Error::AlreadyOnAllowlist);
                }
            }
        }

        // Check if any already on allowlist (fail-fast)
        for address in addresses.iter() {
            if storage::has_entry(&env, &artist, &address) {
                return Err(Error::AlreadyOnAllowlist);
            }
        }

        // Add all addresses (if we get here, all checks passed)
        for address in addresses.iter() {
            let entry = AllowlistEntry {
                artist: artist.clone(),
                address: address.clone(),
                added_at: env.ledger().timestamp(),
                added_by: caller.clone(),
            };
            storage::set_entry(&env, &artist, &address, &entry);

            indexes::add_to_index(&env, &artist, &address);

            env.events().publish(
                (symbol_short!("allowlst"), symbol_short!("batch")),
                (artist.clone(), caller.clone(), address.clone()),
            );
        }

        Ok(())
    }

    /// Remove multiple addresses from an artist's allowlist in a batch operation.
    /// Fails if any address is not on the allowlist (atomic semantics).
    pub fn remove_batch_from_allowlist(
        env: Env,
        artist: Address,
        caller: Address,
        addresses: Vec<Address>,
    ) -> Result<(), Error> {
        access::require_artist_or_manager(&env, &artist, &caller)?;

        if addresses.is_empty() {
            return Err(Error::EmptyBatchOperation);
        }

        // Check if all addresses are on the allowlist (fail-fast)
        for address in addresses.iter() {
            if !storage::has_entry(&env, &artist, &address) {
                return Err(Error::NotOnAllowlist);
            }
        }

        // Remove all addresses (if we get here, all checks passed)
        for address in addresses.iter() {
            storage::remove_entry(&env, &artist, &address);

            indexes::remove_from_index(&env, &artist, &address);

            env.events().publish(
                (symbol_short!("allowlst"), symbol_short!("brem")),
                (artist.clone(), caller.clone(), address.clone()),
            );
        }

        Ok(())
    }

    /// Get the token gate configuration for an artist.
    /// Returns error if token gate is not configured.
    pub fn get_token_gate(env: Env, artist: Address) -> Result<TokenGateConfig, Error> {
        storage::get_token_gate(&env, &artist).ok_or(Error::TokenGateNotFound)
    }

    /// Return a page of allowlist entries for an artist.
    /// page is zero-based; page_size must be 1–100.
    pub fn list_allowlist(env: Env, artist: Address, page: u32, page_size: u32) -> Vec<Address> {
        indexes::get_page(&env, &artist, page, page_size)
    }

    /// Return the total number of addresses on an artist's allowlist.
    pub fn get_allowlist_count(env: Env, artist: Address) -> u32 {
        indexes::get_count(&env, &artist)
    }
}

mod test;
