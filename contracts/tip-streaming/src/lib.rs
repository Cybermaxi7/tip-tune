#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String, symbol_short};
use crate::types::{StreamRecord, StreamStatus, StreamConfig};
use crate::storage::{get_config, set_config, get_stream, set_stream, get_active_stream, set_active_stream, remove_active_stream, increment_stream_count};
use crate::errors::Error;
use crate::event;

mod types;
mod storage;
mod errors;
mod event;

#[contract]
pub struct TipStreaming;

#[contractimpl]
impl TipStreaming {
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        fee_collector: Address,
        fee_basis_points: u32,
        min_rate_per_second: i128,
        max_rate_per_second: i128,
        min_deposit: i128,
    ) -> Result<(), Error> {
        admin.require_auth();

        if get_config(&env).is_some() {
            return Err(Error::AlreadyInitialized);
        }

        let config = StreamConfig {
            admin,
            token,
            fee_collector,
            fee_basis_points,
            min_rate_per_second,
            max_rate_per_second,
            min_deposit,
        };

        set_config(&env, &config);
        Ok(())
    }

    pub fn create_stream(
        env: Env,
        listener: Address,
        artist: Address,
        rate_per_second: i128,
        deposit_amount: i128,
    ) -> Result<String, Error> {
        listener.require_auth();

        let config = get_config(&env).ok_or(Error::NotInitialized)?;

        if listener == artist {
            return Err(Error::SameListenerArtist);
        }

        if rate_per_second < config.min_rate_per_second {
            return Err(Error::RateTooLow);
        }

        if rate_per_second > config.max_rate_per_second {
            return Err(Error::RateTooHigh);
        }

        if deposit_amount < config.min_deposit {
            return Err(Error::BalanceBelowMinimum);
        }

        // Check for existing active stream
        if let Some(_) = get_active_stream(&env, &listener, &artist) {
            return Err(Error::StreamAlreadyActive);
        }

        let stream_id = String::from_slice(
            &env,
            format!(
                "stream_{}",
                increment_stream_count(&env)
            ).as_bytes(),
        );

        let ledger = env.ledger().sequence();
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

        // Transfer deposit from listener
        soroban_sdk::token::TokenClient::new(&env, &config.token)
            .transfer(&listener, &env.current_contract_address(), &deposit_amount);

        set_stream(&env, &stream_id, &stream);
        set_active_stream(&env, &listener, &artist, &stream_id);

        event::stream_started(&env, &stream_id, &listener, &artist, rate_per_second, deposit_amount);

        Ok(stream_id)
    }

    pub fn claim_payment(
        env: Env,
        stream_id: String,
    ) -> Result<i128, Error> {
        let stream = get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Err(Error::StreamAlreadyStopped);
        }

        let config = get_config(&env).ok_or(Error::NotInitialized)?;
        let current_ledger = env.ledger().sequence();

        let time_elapsed = current_ledger - stream.last_settled_at;
        let amount_due = stream.rate_per_second * (time_elapsed as i128);
        let available_balance = stream.deposited_amount - stream.amount_paid;

        let claim_amount = if amount_due > available_balance {
            available_balance
        } else {
            amount_due
        };

        if claim_amount == 0 {
            return Ok(0);
        }

        // Calculate fee
        let fee = (claim_amount * config.fee_basis_points as i128) / 10000;
        let net_amount = claim_amount - fee;

        // Update stream
        let mut updated_stream = stream.clone();
        updated_stream.amount_paid += claim_amount;
        updated_stream.last_settled_at = current_ledger;

        if updated_stream.amount_paid >= updated_stream.deposited_amount {
            updated_stream.status = StreamStatus::Expired;
            updated_stream.stopped_at = Some(current_ledger);
        }

        set_stream(&env, &stream_id, &updated_stream);

        // Transfer payment to artist
        soroban_sdk::token::TokenClient::new(&env, &config.token)
            .transfer(&env.current_contract_address(), &stream.artist, &net_amount);

        // Transfer fee to collector
        if fee > 0 {
            soroban_sdk::token::TokenClient::new(&env, &config.token)
                .transfer(&env.current_contract_address(), &config.fee_collector, &fee);
        }

        event::payment_settled(&env, &stream_id, &stream.artist, net_amount);

        Ok(net_amount)
    }

    pub fn stop_stream(
        env: Env,
        stream_id: String,
    ) -> Result<i128, Error> {
        let mut stream = get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)?;

        stream.listener.require_auth();

        if stream.status != StreamStatus::Active {
            return Err(Error::StreamAlreadyStopped);
        }

        let config = get_config(&env).ok_or(Error::NotInitialized)?;
        let current_ledger = env.ledger().sequence();

        // Settle any pending payments first
        let time_elapsed = current_ledger - stream.last_settled_at;
        let amount_due = stream.rate_per_second * (time_elapsed as i128);
        let available_balance = stream.deposited_amount - stream.amount_paid;

        let claim_amount = if amount_due > available_balance {
            available_balance
        } else {
            amount_due
        };

        if claim_amount > 0 {
            let fee = (claim_amount * config.fee_basis_points as i128) / 10000;
            let net_amount = claim_amount - fee;

            stream.amount_paid += claim_amount;

            if net_amount > 0 {
                soroban_sdk::token::TokenClient::new(&env, &config.token)
                    .transfer(&env.current_contract_address(), &stream.artist, &net_amount);
            }

            if fee > 0 {
                soroban_sdk::token::TokenClient::new(&env, &config.token)
                    .transfer(&env.current_contract_address(), &config.fee_collector, &fee);
            }
        }

        // Calculate refund
        let refund_amount = stream.deposited_amount - stream.amount_paid;

        stream.status = StreamStatus::Stopped;
        stream.stopped_at = Some(current_ledger);
        stream.last_settled_at = current_ledger;

        set_stream(&env, &stream_id, &stream);
        remove_active_stream(&env, &stream.listener, &stream.artist);

        // Refund remaining balance to listener
        if refund_amount > 0 {
            soroban_sdk::token::TokenClient::new(&env, &config.token)
                .transfer(&env.current_contract_address(), &stream.listener, &refund_amount);
        }

        event::stream_stopped(&env, &stream_id, &stream.listener, &stream.artist, stream.amount_paid, refund_amount);

        Ok(refund_amount)
    }

    pub fn get_stream(
        env: Env,
        stream_id: String,
    ) -> Result<StreamRecord, Error> {
        get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)
    }

    pub fn get_claimable_amount(
        env: Env,
        stream_id: String,
    ) -> Result<i128, Error> {
        let stream = get_stream(&env, &stream_id).ok_or(Error::StreamNotFound)?;

        if stream.status != StreamStatus::Active {
            return Ok(0);
        }

        let current_ledger = env.ledger().sequence();
        let time_elapsed = current_ledger - stream.last_settled_at;
        let amount_due = stream.rate_per_second * (time_elapsed as i128);
        let available_balance = stream.deposited_amount - stream.amount_paid;

        Ok(if amount_due > available_balance {
            available_balance
        } else {
            amount_due
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_stream_creation() {
        // Test implementation in separate test.rs file
    }
}
