use soroban_sdk::Env;

use crate::types::{DataKey, TimeLockStatus, TimeLockTip};

pub(crate) const LEDGER_SECONDS: u64 = 5;
pub(crate) const DAY_IN_LEDGERS: u32 = 17_280;

const REFUND_DELAY_SECONDS: u64 = 30 * 24 * 60 * 60;
const ACTIVE_LOCK_BUFFER_SECONDS: u64 = 7 * 24 * 60 * 60;
const FINALIZED_RETENTION_DAYS: u32 = 30;
const INDEX_RETENTION_DAYS: u32 = 90;
const INSTANCE_RETENTION_DAYS: u32 = 120;

fn seconds_to_ledgers(seconds: u64) -> u32 {
    let ledgers = seconds
        .saturating_add(LEDGER_SECONDS - 1)
        .saturating_div(LEDGER_SECONDS);

    ledgers.min(u64::from(u32::MAX)) as u32
}

fn finalized_ttl() -> u32 {
    FINALIZED_RETENTION_DAYS * DAY_IN_LEDGERS
}

pub(crate) fn index_access_ttl() -> u32 {
    INDEX_RETENTION_DAYS * DAY_IN_LEDGERS
}

pub(crate) fn instance_access_ttl() -> u32 {
    INSTANCE_RETENTION_DAYS * DAY_IN_LEDGERS
}

fn active_tip_ttl(env: &Env, tip: &TimeLockTip) -> u32 {
    let now = env.ledger().timestamp();
    let refund_deadline = tip
        .unlock_time
        .saturating_add(REFUND_DELAY_SECONDS)
        .saturating_add(ACTIVE_LOCK_BUFFER_SECONDS);
    let remaining = refund_deadline.saturating_sub(now);

    seconds_to_ledgers(remaining).max(index_access_ttl())
}

pub(crate) fn ttl_for_tip(env: &Env, tip: &TimeLockTip) -> u32 {
    match tip.status {
        TimeLockStatus::Locked => active_tip_ttl(env, tip),
        TimeLockStatus::Claimed | TimeLockStatus::Refunded => finalized_ttl(),
    }
}

pub(crate) fn extend_persistent(env: &Env, key: &DataKey, ttl: u32) {
    env.storage().persistent().extend_ttl(key, ttl, ttl);
}

pub(crate) fn extend_instance(env: &Env, ttl: u32) {
    env.storage().instance().extend_ttl(ttl, ttl);
}