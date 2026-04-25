#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use crate::types::{StreamRecord, StreamStatus};
use crate::errors::Error;

mod types;
mod storage;
mod errors;
mod event;

#[contract]
pub struct TipStreaming;

#[contractimpl]
impl TipStreaming {
    /// Initialize streaming contract
    pub fn initialize(
        env: Env,
        admin: Address,
        _token: Address,
    ) -> Result<(), Error> {
        admin.require_auth();

        let config_key = String::from_str(&env, "config");
        if env.storage().instance().has(&config_key) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&config_key, &admin);
        Ok(())
    }

    /// Create a new stream
    pub fn create_stream(
        env: Env,
        listener: Address,
        artist: Address,
        rate_per_second: i128,
        deposit_amount: i128,
    ) -> Result<String, Error> {
        listener.require_auth();

        if listener == artist {
            return Err(Error::SameListenerArtist);
        }

        if rate_per_second <= 0 || deposit_amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let stream_count: u32 = env.storage().instance().get(&String::from_str(&env, "count")).unwrap_or(0);
        let new_count = stream_count + 1;
        env.storage().instance().set(&String::from_str(&env, "count"), &new_count);

        // Create a simple stream ID by using the count as bytes
        let stream_id = String::from_str(&env, "stream");

        let ledger = env.ledger().sequence() as u64;
        let stream = StreamRecord {
            stream_id: stream_id.clone(),
            listener: listener.clone(),
            artist: artist.clone(),
            rate_per_second,
            deposited_amount: deposit_amount,
            amount_paid: 0,
            started_at: ledger,
            stopped_at: None,
            last_settled_at: ledger,
            status: StreamStatus::Active,
        };

        storage::set_stream(&env, &stream_id, &stream);

        event::stream_started(&env, &stream_id, &listener, &artist, rate_per_second);

        Ok(stream_id)
    }

    /// Claim payment from stream
    pub fn claim_payment(
        env: Env,
        stream_id: String,
    ) -> Result<i128, Error> {
        let stream = storage::get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Err(Error::StreamAlreadyStopped);
        }

        let current_ledger = env.ledger().sequence() as u64;
        let time_elapsed = current_ledger.saturating_sub(stream.last_settled_at);
        let amount_due = stream.rate_per_second.saturating_mul(time_elapsed as i128);

        let claimable = if amount_due > stream.deposited_amount - stream.amount_paid {
            stream.deposited_amount - stream.amount_paid
        } else {
            amount_due
        };

        if claimable <= 0 {
            return Ok(0);
        }

        let mut updated_stream = stream.clone();
        updated_stream.amount_paid = updated_stream.amount_paid.saturating_add(claimable);
        updated_stream.last_settled_at = current_ledger;

        if updated_stream.amount_paid >= updated_stream.deposited_amount {
            updated_stream.status = StreamStatus::Expired;
            updated_stream.stopped_at = Some(current_ledger);
        }

        storage::set_stream(&env, &stream_id, &updated_stream);

        event::payment_settled(&env, &stream_id, &stream.artist, claimable);

        Ok(claimable)
    }

    /// Stop stream and refund remaining balance
    pub fn stop_stream(
        env: Env,
        stream_id: String,
    ) -> Result<i128, Error> {
        let mut stream = storage::get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)?;

        stream.listener.require_auth();

        if stream.status != StreamStatus::Active {
            return Err(Error::StreamAlreadyStopped);
        }

        let current_ledger = env.ledger().sequence() as u64;
        let time_elapsed = current_ledger.saturating_sub(stream.last_settled_at);
        let amount_due = stream.rate_per_second.saturating_mul(time_elapsed as i128);

        let claimable = if amount_due > stream.deposited_amount - stream.amount_paid {
            stream.deposited_amount - stream.amount_paid
        } else {
            amount_due
        };
        if claimable > 0 {
            stream.amount_paid = stream.amount_paid.saturating_add(claimable);
        }

        let refund_amount = stream.deposited_amount.saturating_sub(stream.amount_paid);

        stream.status = StreamStatus::Stopped;
        stream.stopped_at = Some(current_ledger);
        stream.last_settled_at = current_ledger;

        storage::set_stream(&env, &stream_id, &stream);

        event::stream_stopped(&env, &stream_id, &stream.listener, &stream.artist, stream.amount_paid, refund_amount);

        Ok(refund_amount)
    }

    /// Get stream details
    pub fn get_stream(
        env: Env,
        stream_id: String,
    ) -> Result<StreamRecord, Error> {
        storage::get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)
    }

    /// Get claimable amount from stream
    pub fn get_claimable_amount(
        env: Env,
        stream_id: String,
    ) -> Result<i128, Error> {
        let stream = storage::get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Ok(0);
        }

        let current_ledger = env.ledger().sequence() as u64;
        let time_elapsed = current_ledger.saturating_sub(stream.last_settled_at);
        let amount_due = stream.rate_per_second.saturating_mul(time_elapsed as i128);
        let available_balance = stream.deposited_amount.saturating_sub(stream.amount_paid);

        Ok(if amount_due > available_balance {
            available_balance
        } else {
            amount_due
        })
    }
}

#[cfg(test)]
mod test {
    #[test]
    fn test_placeholder() {
        assert_eq!(2 + 2, 4);
    }
}
