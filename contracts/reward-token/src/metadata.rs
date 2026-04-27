use soroban_sdk::{contracttype, Env, String};

use crate::errors::Error;
use crate::DataKey;

/// Token metadata set at initialization and immutable afterward.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
    pub contract_version: u32,
}

/// Validate and persist token metadata during initialization.
pub fn init_metadata(env: &Env, name: String, symbol: String, decimals: u32) -> Result<(), Error> {
    if name.is_empty() || symbol.is_empty() {
        return Err(Error::EmptyMetadata);
    }
    // Standard Stellar/Soroban token decimals: 0-15
    if decimals > 15 {
        return Err(Error::EmptyMetadata);
    }
    let meta = TokenMetadata {
        name,
        symbol,
        decimals,
        contract_version: 1,
    };
    env.storage().instance().set(&DataKey::Metadata, &meta);
    Ok(())
}

/// Read token metadata from instance storage.
pub fn get_metadata(env: &Env) -> Option<TokenMetadata> {
    env.storage().instance().get(&DataKey::Metadata)
}