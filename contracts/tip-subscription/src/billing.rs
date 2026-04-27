use crate::types::{Error, GRACE_PERIOD_SECONDS, Subscription, SubscriptionStatus};
use crate::events;
use soroban_sdk::{Address, Env};

/// Evaluate subscription state based on next_payment_timestamp and current time.
/// Returns the derived status without mutating the subscription.
pub fn derive_subscription_status(sub: &Subscription, current_time: u64) -> SubscriptionStatus {
    if sub.status == SubscriptionStatus::Paused
        || sub.status == SubscriptionStatus::Cancelled
    {
        return sub.status.clone();
    }

    if current_time >= sub.next_payment_timestamp {
        // Payment is overdue
        let overdue_duration = current_time - sub.next_payment_timestamp;
        if overdue_duration >= GRACE_PERIOD_SECONDS {
            SubscriptionStatus::PastDue
        } else {
            SubscriptionStatus::GracePeriod
        }
    } else {
        SubscriptionStatus::Active
    }
}

/// Update subscription status based on current time, emitting events if status changed.
/// Returns true if the status changed (for event emission).
pub fn update_status_for_time(
    env: &Env,
    sub: &mut Subscription,
    current_time: u64,
) -> bool {
    let derived = derive_subscription_status(sub, current_time);
    if derived != sub.status {
        let old_status = sub.status.clone();
        sub.status = derived.clone();

        match derived {
            SubscriptionStatus::GracePeriod => {
                if old_status == SubscriptionStatus::Active {
                    events::subscription_grace_period(env, sub.id.clone(), sub.subscriber.clone());
                }
            }
            SubscriptionStatus::PastDue => {
                if old_status == SubscriptionStatus::GracePeriod || old_status == SubscriptionStatus::Active {
                    events::subscription_past_due(env, sub.id.clone(), sub.subscriber.clone());
                }
            }
            _ => {}
        }
        true
    } else {
        false
    }
}

/// Determine if payment can be attempted in the current status.
pub fn can_attempt_payment(status: &SubscriptionStatus) -> bool {
    matches!(status, SubscriptionStatus::Active | SubscriptionStatus::GracePeriod | SubscriptionStatus::PastDue)
}

/// On successful payment: reset status to Active and recalculate next_payment_timestamp.
pub fn on_payment_success(sub: &mut Subscription, current_time: u64, frequency: &SubscriptionFrequency) -> Result<(), Error> {
    sub.status = SubscriptionStatus::Active;
    let duration = match frequency {
        SubscriptionFrequency::Weekly => WEEK_IN_SECONDS,
        SubscriptionFrequency::Monthly => MONTH_IN_SECONDS,
    };
    // Calculate next payment from the original scheduled date to maintain cycle
    let mut next_payment = sub.next_payment_timestamp;
    while next_payment <= current_time {
        next_payment = next_payment
            .checked_add(duration)
            .ok_or(Error::TimestampOverflow)?;
    }
    sub.next_payment_timestamp = next_payment;
    Ok(())
}

/// On payment failure: update status (GracePeriod -> PastDue, PastDue stays).
pub fn on_payment_failure(sub: &mut Subscription) {
    if sub.status == SubscriptionStatus::GracePeriod {
        sub.status = SubscriptionStatus::PastDue;
    }
    // PastDue remains PastDue
}

/// Check if subscription is delinquent (PastDue).
pub fn is_delinquent(status: &SubscriptionStatus) -> bool {
    status == &SubscriptionStatus::PastDue
}

/// Check if subscription is within the grace period.
pub fn is_in_grace_period(status: &SubscriptionStatus) -> bool {
    status == &SubscriptionStatus::GracePeriod
}

/// Calculate the grace period expiration timestamp.
pub fn grace_period_ends_at(next_payment: u64) -> u64 {
    next_payment + GRACE_PERIOD_SECONDS
}

/// Get time remaining in grace period (returns 0 if expired or not applicable).
pub fn time_remaining_in_grace_period(current_time: u64, next_payment: u64) -> u64 {
    let ends_at = grace_period_ends_at(next_payment);
    if current_time >= ends_at {
        0
    } else {
        ends_at - current_time
    }
}

const WEEK_IN_SECONDS: u64 = 604_800;
const MONTH_IN_SECONDS: u64 = 2_592_000;
