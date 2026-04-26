#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, vec, Address, Env, String,
    Vec,
};

mod indexes;

use indexes::{
    add_tip_to_artist_index, get_artist_tip_at_index, get_artist_tip_count, get_tip_id_by_tx_hash,
    has_tx_hash_index, set_tx_hash_to_tip_id,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyVerified = 1,
    InvalidAmount = 2,
    TipNotFound = 3,
    Unauthorized = 4,
    DuplicateTipId = 5,
    DuplicateTxHash = 6,
    ArtistNotFound = 7,
    InvalidIndex = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    VerifiedTx(String),
    TipRecord(String),
    TipCount,
    UserTipCount(Address),
    // Secondary indexes
    TxHashToTipId(String),
    ArtistTipCount(Address),
    ArtistTipIndex(Address, u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedTip {
    pub tip_id: String,
    pub tipper: Address,
    pub artist: Address,
    pub amount: i128,
    pub tx_hash: String,
    pub timestamp: u64,
    pub verified: bool,
}

#[contract]
pub struct TipVerificationContract;

#[contractimpl]
impl TipVerificationContract {
    /// Initialize the contract with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TipCount, &0u64);
    }

    /// Verify a tip transaction by its hash and expected amount.
    /// Returns true if valid and not previously verified, preventing double-spending.
    pub fn verify_tip(env: Env, tx_hash: String, expected_amount: i128) -> Result<bool, Error> {
        if expected_amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::VerifiedTx(tx_hash.clone()))
        {
            return Err(Error::AlreadyVerified);
        }

        env.storage()
            .persistent()
            .set(&DataKey::VerifiedTx(tx_hash.clone()), &true);

        env.events().publish(
            (symbol_short!("tip"), symbol_short!("verified")),
            (tx_hash, expected_amount),
        );

        Ok(true)
    }

    /// Record a verified tip with full details. Immutable once recorded.
    /// Maintains secondary indexes: tx_hash → tip_id and artist → [tip_ids].
    pub fn record_verified_tip(
        env: Env,
        tip_id: String,
        tipper: Address,
        artist: Address,
        amount: i128,
        tx_hash: String,
    ) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        // Prevent duplicate tip IDs (immutability)
        if env
            .storage()
            .persistent()
            .has(&DataKey::TipRecord(tip_id.clone()))
        {
            return Err(Error::DuplicateTipId);
        }

        // Prevent duplicate tx_hash across all tips
        if has_tx_hash_index(&env, &tx_hash) {
            return Err(Error::DuplicateTxHash);
        }

        let tip = VerifiedTip {
            tip_id: tip_id.clone(),
            tipper: tipper.clone(),
            artist: artist.clone(),
            amount,
            tx_hash: tx_hash.clone(),
            timestamp: env.ledger().timestamp(),
            verified: true,
        };

        // Store the primary record by tip_id
        env.storage()
            .persistent()
            .set(&DataKey::TipRecord(tip_id.clone()), &tip);

        // Secondary index: tx_hash → tip_id
        set_tx_hash_to_tip_id(&env, &tx_hash, &tip_id);

        // Secondary index: artist → [tip_ids] (append)
        add_tip_to_artist_index(&env, &artist, &tip_id);

        // Increment global tip count
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TipCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TipCount, &(count + 1));

        // Increment per-user tip count
        let user_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UserTipCount(tipper.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::UserTipCount(tipper), &(user_count + 1));

        env.events().publish(
            (symbol_short!("tip"), symbol_short!("recorded")),
            tip,
        );

        Ok(())
    }

    /// Check if a transaction has already been verified.
    pub fn is_verified(env: Env, tx_hash: String) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::VerifiedTx(tx_hash))
            .unwrap_or(false)
    }

    /// Get a recorded tip by its tip ID.
    pub fn get_tip(env: Env, tip_id: String) -> Result<VerifiedTip, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::TipRecord(tip_id))
            .ok_or(Error::TipNotFound)
    }

    /// Get total number of recorded tips.
    pub fn get_tip_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::TipCount)
            .unwrap_or(0)
    }

    /// Get total tips sent by a specific user.
    pub fn get_user_tip_count(env: Env, user: Address) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::UserTipCount(user))
            .unwrap_or(0)
    }

    /// Get a verified tip by its transaction hash (secondary index lookup).
    pub fn get_tip_by_tx_hash(env: Env, tx_hash: String) -> Result<VerifiedTip, Error> {
        let tip_id = get_tip_id_by_tx_hash(&env, &tx_hash).ok_or(Error::TipNotFound)?;
        env.storage()
            .persistent()
            .get(&DataKey::TipRecord(tip_id))
            .ok_or(Error::TipNotFound)
    }

    /// Get the number of tips received by an artist.
    pub fn get_artist_tip_count(env: Env, artist: Address) -> u32 {
        get_artist_tip_count(&env, &artist)
    }

    /// Get a specific tip for an artist by position index.
    /// Returns InvalidIndex if the index is out of bounds.
    pub fn get_artist_tip_at_index(
        env: Env,
        artist: Address,
        index: u32,
    ) -> Result<VerifiedTip, Error> {
        let tip_id =
            get_artist_tip_at_index(&env, &artist, index).ok_or(Error::InvalidIndex)?;
        env.storage()
            .persistent()
            .get(&DataKey::TipRecord(tip_id))
            .ok_or(Error::TipNotFound)
    }

    /// List all tips received by a specific artist.
    pub fn get_tips_for_artist(env: Env, artist: Address) -> Vec<VerifiedTip> {
        let count = get_artist_tip_count(&env, &artist);
        let mut tips: Vec<VerifiedTip> = vec![&env];

        for i in 0..count {
            if let Some(tip_id) = get_artist_tip_at_index(&env, &artist, i) {
                if let Some(tip) = env
                    .storage()
                    .persistent()
                    .get::<_, VerifiedTip>(&DataKey::TipRecord(tip_id))
                {
                    tips.push_back(tip);
                }
            }
        }

        tips
    }
}

mod test;
