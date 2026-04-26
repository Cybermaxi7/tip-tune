#![no_std]

pub mod events;
pub mod indexes;
pub mod storage;
pub mod types;
pub mod billing;

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, String, Vec};
use storage::{read_subscription, write_subscription};
use types::{Error, Subscription, SubscriptionFrequency, SubscriptionStatus};
use billing::{can_attempt_payment, on_payment_failure, on_payment_success, update_status_for_time};

const WEEK_IN_SECONDS: u64 = 604_800;
const MONTH_IN_SECONDS: u64 = 2_592_000;

#[contract]
pub struct TipSubscriptionContract;

#[contractimpl]
impl TipSubscriptionContract {
    pub fn create_subscription(
        env: Env,
        subscriber: Address,
        artist: Address,
        token: Address,
        amount: i128,
        frequency: SubscriptionFrequency,
    ) -> Result<String, Error> {
        subscriber.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if indexes::active_subscription(&env, &subscriber, &artist, &token).is_some() {
            return Err(Error::DuplicateSubscription);
        }

        let count_key = symbol_short!("sub_cnt");
        let count: u32 = env.storage().instance().get(&count_key).unwrap_or(0);
        let next_count = count.checked_add(1).ok_or(Error::Overflow)?;
        env.storage().instance().set(&count_key, &next_count);

        let mut buffer = [0u8; 10];
        let mut num = next_count;
        let mut len = 0;
        while num > 0 {
            buffer[len] = b'0' + (num % 10) as u8;
            num /= 10;
            len += 1;
        }
        for i in 0..(len / 2) {
            buffer.swap(i, len - 1 - i);
        }
        let sub_id = String::from_bytes(&env, &buffer[..len]);

        let current_time = env.ledger().timestamp();
        let duration = match frequency {
            SubscriptionFrequency::Weekly => WEEK_IN_SECONDS,
            SubscriptionFrequency::Monthly => MONTH_IN_SECONDS,
        };
        let next_payment_timestamp = current_time
            .checked_add(duration)
            .ok_or(Error::TimestampOverflow)?;

        let subscription = Subscription {
            id: sub_id.clone(),
            subscriber: subscriber.clone(),
            artist: artist.clone(),
            token: token.clone(),
            amount,
            frequency,
            status: SubscriptionStatus::Active,
            next_payment_timestamp,
        };

        write_subscription(&env, &sub_id, &subscription);
        indexes::put_active_subscription(&env, &subscription);
        indexes::add_subscriber_subscription(&env, &subscriber, &sub_id);

        events::subscription_created(&env, sub_id.clone(), subscriber);

        Ok(sub_id)
    }

    pub fn process_payment(env: Env, subscription_id: String) -> Result<(), Error> {
        let current_time = env.ledger().timestamp();
        let mut sub =
            read_subscription(&env, &subscription_id).ok_or(Error::SubscriptionNotFound)?;

        // Cancelled subscriptions cannot be paid
        if sub.status == SubscriptionStatus::Cancelled {
            return Err(Error::InvalidStatus);
        }

        // Update subscription status based on current time (detect overdue/grace transitions)
        let _status_changed = billing::update_status_for_time(&env, &mut sub, current_time);

        // Check if payment can be attempted
        if !billing::can_attempt_payment(&sub.status) {
            // Paused subscriptions cannot be paid
            return Err(Error::InvalidStatus);
        }

        // Additional guard: Active subscriptions cannot pay before due date
        if sub.status == SubscriptionStatus::Active && current_time < sub.next_payment_timestamp {
            return Err(Error::PaymentTooEarly);
        }

        // Attempt token transfer
        let token_client = token::Client::new(&env, &sub.token);
        let transfer_result = token_client.transfer(&sub.subscriber, &sub.artist, &sub.amount);

        if transfer_result.is_ok() {
            // Payment succeeded: update status to Active and schedule next payment
            billing::on_payment_success(&mut sub, current_time, &sub.frequency)?;

            write_subscription(&env, &subscription_id, &sub);
            indexes::update_active_subscription(&env, &sub);

            events::payment_processed(&env, subscription_id, sub.amount);
        } else {
            // Payment failed: update status (GracePeriod -> PastDue)
            billing::on_payment_failure(&mut sub);
            write_subscription(&env, &subscription_id, &sub);
            indexes::update_active_subscription(&env, &sub);
            events::payment_failed(&env, subscription_id, sub.amount);
            return Err(Error::PaymentFailed);
        }

        Ok(())
    }

        // Update subscription status based on current time (detect overdue/grace transitions)
        let _status_changed = billing::update_status_for_time(&env, &mut sub, current_time);

        // Check if payment can be attempted
        if !billing::can_attempt_payment(&sub.status) {
            // Paused subscriptions cannot be paid
            return Err(Error::InvalidStatus);
        }

        // Attempt token transfer
        let token_client = token::Client::new(&env, &sub.token);
        let transfer_result = token_client.transfer(&sub.subscriber, &sub.artist, &sub.amount);

        if transfer_result.is_ok() {
            // Payment succeeded: reset to Active and schedule next payment
            billing::on_payment_success(&mut sub, current_time, &sub.frequency)?;

            write_subscription(&env, &subscription_id, &sub);
            indexes::update_active_subscription(&env, &sub);

            events::payment_processed(&env, subscription_id, sub.amount);
        } else {
            // Payment failed: update status (GracePeriod -> PastDue)
            billing::on_payment_failure(&mut sub);
            write_subscription(&env, &subscription_id, &sub);
            indexes::update_active_subscription(&env, &sub);
            events::payment_failed(&env, subscription_id, sub.amount);
            return Err(Error::PaymentFailed);
        }

        Ok(())
    }

    pub fn cancel_subscription(env: Env, subscription_id: String) -> Result<(), Error> {
        let mut sub =
            read_subscription(&env, &subscription_id).ok_or(Error::SubscriptionNotFound)?;
        sub.subscriber.require_auth();

        // FIX: Prevent double-cancel
        if sub.status == SubscriptionStatus::Cancelled {
            return Err(Error::InvalidStatus);
        }

        sub.status = SubscriptionStatus::Cancelled;
        write_subscription(&env, &subscription_id, &sub);
        indexes::remove_active_subscription(&env, &sub);

        events::subscription_cancelled(&env, subscription_id, sub.subscriber);

        Ok(())
    }

    pub fn pause_subscription(env: Env, subscription_id: String) -> Result<(), Error> {
        let mut sub =
            read_subscription(&env, &subscription_id).ok_or(Error::SubscriptionNotFound)?;
        sub.subscriber.require_auth();

        // FIX: Require Active status before pausing
        if sub.status != SubscriptionStatus::Active {
            return Err(Error::InvalidStatus);
        }

        sub.status = SubscriptionStatus::Paused;
        write_subscription(&env, &subscription_id, &sub);

        events::subscription_paused(&env, subscription_id, sub.subscriber);

        Ok(())
    }

    pub fn resume_subscription(env: Env, subscription_id: String) -> Result<(), Error> {
        let mut sub =
            read_subscription(&env, &subscription_id).ok_or(Error::SubscriptionNotFound)?;
        sub.subscriber.require_auth();

        if sub.status != SubscriptionStatus::Paused {
            return Err(Error::InvalidStatus);
        }

        sub.status = SubscriptionStatus::Active;
        write_subscription(&env, &subscription_id, &sub);

        events::subscription_resumed(&env, subscription_id, sub.subscriber);

        Ok(())
    }

    pub fn get_subscription(env: Env, subscription_id: String) -> Result<Subscription, Error> {
        read_subscription(&env, &subscription_id).ok_or(Error::SubscriptionNotFound)
    }

    pub fn get_sub_ids_by_subscriber(env: Env, subscriber: Address) -> Vec<String> {
        indexes::subscriber_subscriptions(&env, &subscriber)
    }

    pub fn get_subscriptions_by_subscriber(env: Env, subscriber: Address) -> Vec<Subscription> {
        let ids = indexes::subscriber_subscriptions(&env, &subscriber);
        let mut subscriptions = Vec::new(&env);
        for id in ids.iter() {
            if let Some(subscription) = read_subscription(&env, &id) {
                subscriptions.push_back(subscription);
            }
        }
        subscriptions
    }

    /// Refresh the subscription status based on current time.
    /// Used to transition into GracePeriod/PastDue automatically.
    pub fn refresh_subscription_status(env: Env, subscription_id: String) -> Result<(), Error> {
        let current_time = env.ledger().timestamp();
        let mut sub = read_subscription(&env, &subscription_id).ok_or(Error::SubscriptionNotFound)?;
        billing::update_status_for_time(&env, &mut sub, current_time);
        write_subscription(&env, &subscription_id, &sub);
        indexes::update_active_subscription(&env, &sub);
        Ok(())
    }
}

#[cfg(test)]
mod test;
