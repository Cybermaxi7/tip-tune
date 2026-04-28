#![no_std]
#![allow(clippy::too_many_arguments)]

mod queries;
mod rent;
mod storage;
mod types;
mod events;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, Env, String, Vec};
use events::{emit_tip_claimed, emit_tip_created, emit_tip_refunded};
use types::{Asset, Error, TimeLockStatus, TimeLockTip};

#[contract]
pub struct TimeLockContract;

#[contractimpl]
impl TimeLockContract {
    pub fn create_time_lock_tip(
        env: Env,
        tipper: Address,
        artist: Address,
        amount: i128,
        asset_address: Address,
        unlock_time: u64,
        message: String,
        nonce: u64,
    ) -> Result<String, Error> {
        tipper.require_auth();

        // Replay protection: check and update actor nonce
        let last_nonce = storage::get_actor_nonce(&env, &tipper);
        if nonce <= last_nonce {
            return Err(Error::InvalidNonce);
        }
        storage::set_actor_nonce(&env, &tipper, nonce);

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let current_time = env.ledger().timestamp();
        if unlock_time <= current_time {
            return Err(Error::InvalidUnlockTime);
        }

        // Lock funds inside contract
        let token_client = token::Client::new(&env, &asset_address);
        token_client.transfer(&tipper, &env.current_contract_address(), &amount);

        let counter = storage::increment_counter(&env);

        // Generate lock_id (simple string conversion of counter)
        let mut buf = [0u8; 10];
        let mut i = 10;
        let mut n = counter;
        if n == 0 {
            i -= 1;
            buf[i] = b'0';
        } else {
            while n > 0 {
                i -= 1;
                buf[i] = b'0' + (n % 10) as u8;
                n /= 10;
            }
        }
        let lock_id_str = core::str::from_utf8(&buf[i..]).unwrap();
        let lock_id = String::from_str(&env, lock_id_str);

        let tip = TimeLockTip {
            lock_id: lock_id.clone(),
            tipper,
            artist,
            amount,
            asset: Asset::Token(asset_address),
            unlock_time,
            message,
            status: TimeLockStatus::Locked,
            created_at: current_time,
        };

        storage::save_tip(&env, lock_id.clone(), &tip);

        // Emit canonical tip action event
        emit_tip_created(&env, &tip);

        Ok(lock_id)
    }

    pub fn claim_tip(
        env: Env,
        lock_id: String,
        artist: Address,
        nonce: u64,
    ) -> Result<i128, Error> {
        artist.require_auth();

        // Replay protection: check and update actor nonce
        let last_nonce = storage::get_actor_nonce(&env, &artist);
        if nonce <= last_nonce {
            return Err(Error::InvalidNonce);
        }
        storage::set_actor_nonce(&env, &artist, nonce);

        let mut tip = storage::get_tip(&env, lock_id).ok_or(Error::LockNotFound)?;

        if tip.artist != artist {
            return Err(Error::Unauthorized);
        }

        if tip.status != TimeLockStatus::Locked {
            return Err(Error::AlreadyClaimedOrRefunded);
        }

        let current_time = env.ledger().timestamp();
        if current_time < tip.unlock_time {
            return Err(Error::NotUnlockedYet);
        }

        tip.status = TimeLockStatus::Claimed;
        storage::update_tip(&env, &tip);

        // Transfer funds to artist
        match &tip.asset {
            Asset::Token(token_address) => {
                let token_client = token::Client::new(&env, token_address);
                token_client.transfer(&env.current_contract_address(), &artist, &tip.amount);
            }
        }

        // Emit canonical tip action event for claim
        emit_tip_claimed(&env, &tip, &artist);

        Ok(tip.amount)
    }

    pub fn refund_tip(env: Env, lock_id: String, tipper: Address, nonce: u64) -> Result<(), Error> {
        tipper.require_auth();

        // Replay protection: check and update actor nonce
        let last_nonce = storage::get_actor_nonce(&env, &tipper);
        if nonce <= last_nonce {
            return Err(Error::InvalidNonce);
        }
        storage::set_actor_nonce(&env, &tipper, nonce);

        let mut tip = storage::get_tip(&env, lock_id).ok_or(Error::LockNotFound)?;

        if tip.tipper != tipper {
            return Err(Error::Unauthorized);
        }

        if tip.status != TimeLockStatus::Locked {
            return Err(Error::AlreadyClaimedOrRefunded);
        }

        let current_time = env.ledger().timestamp();
        // Refund available 30 days after unlock_time
        let refund_delay = 30 * 24 * 60 * 60; // 30 days in seconds
        if current_time < tip.unlock_time + refund_delay {
            return Err(Error::RefundNotAvailableYet);
        }

        tip.status = TimeLockStatus::Refunded;
        storage::update_tip(&env, &tip);

        // Transfer funds back to tipper
        match &tip.asset {
            Asset::Token(token_address) => {
                let token_client = token::Client::new(&env, token_address);
                token_client.transfer(&env.current_contract_address(), &tipper, &tip.amount);
            }
        }

        // Emit canonical tip action event for refund
        emit_tip_refunded(&env, &tip, &tipper);

        Ok(())
    }

    pub fn get_pending_tips(env: Env, artist: Address) -> Vec<TimeLockTip> {
        let tip_ids = storage::get_artist_tips(&env, artist);
        let mut pending = Vec::new(&env);
        for lock_id in tip_ids.iter() {
            if let Some(tip) = storage::get_tip(&env, lock_id) {
                if tip.status == TimeLockStatus::Locked {
                    pending.push_back(tip);
                }
            }
        }
        pending
    }

    /// Get all time-lock tip IDs created by a tipper.
    pub fn get_tipper_tip_ids(env: Env, tipper: Address) -> Vec<String> {
        queries::get_tipper_tips(env, tipper)
    }

    /// Get full tip details for all locks created by a tipper.
    pub fn get_tipper_tip_details(env: Env, tipper: Address) -> Vec<TimeLockTip> {
        queries::get_tipper_tip_details(env, tipper)
    }

    /// Get all refund-eligible lock IDs for a tipper.
    /// Requires ledger timestamp to be past unlock_time + 30 days.
    pub fn get_refundable_locks(env: Env, tipper: Address) -> Vec<String> {
        queries::get_refundable_locks(env, tipper)
    }
}
