use soroban_sdk::{Env, Vec};

use crate::storage;
use crate::types::TimeLockStatus;

/// Get all time-lock tips created by a specific tipper.
pub fn get_tipper_tips(env: Env, tipper_address: soroban_sdk::Address) -> Vec<soroban_sdk::String> {
    storage::get_tipper_tips(&env, tipper_address)
}

/// Get all time-lock tips for a specific tipper and optionally filter by status.
pub fn get_tipper_tips_by_status(
    env: Env,
    tipper_address: soroban_sdk::Address,
    status: Option<TimeLockStatus>,
) -> Vec<soroban_sdk::String> {
    let tip_ids = storage::get_tipper_tips(&env, tipper_address);
    match status {
        Some(_) => {
            let mut filtered = Vec::new(&env);
            for lock_id in tip_ids.iter() {
                let lid = lock_id.clone();
                if let Some(tip) = storage::get_tip(&env, lid) {
                    if Some(tip.status.clone()) == status {
                        filtered.push_back(lock_id);
                    }
                }
            }
            filtered
        }
        None => tip_ids,
    }
}

/// Get all refund-eligible locks for a tipper.
/// A lock is refund-eligible if status is Locked and current_time >= unlock_time + 30 days.
pub fn get_refundable_locks(
    env: Env,
    tipper_address: soroban_sdk::Address,
) -> Vec<soroban_sdk::String> {
    let tip_ids = storage::get_tipper_tips(&env, tipper_address);
    let current_time = env.ledger().timestamp();
    let refund_delay = 30 * 24 * 60 * 60;
    let refund_window = current_time.saturating_sub(refund_delay);

    let mut refundable = Vec::new(&env);
    for lock_id in tip_ids.iter() {
        let lid = lock_id.clone();
        if let Some(tip) = storage::get_tip(&env, lid) {
            if tip.status == TimeLockStatus::Locked && tip.unlock_time <= refund_window {
                refundable.push_back(lock_id);
            }
        }
    }
    refundable
}

/// Get time-lock details for a tipper, returning full TimeLockTip structs.
pub fn get_tipper_tip_details(
    env: Env,
    tipper_address: soroban_sdk::Address,
) -> Vec<crate::types::TimeLockTip> {
    let tip_ids = storage::get_tipper_tips(&env, tipper_address);
    let mut tips = Vec::new(&env);
    for lock_id in tip_ids.iter() {
        if let Some(tip) = storage::get_tip(&env, lock_id) {
            tips.push_back(tip);
        }
    }
    tips
}