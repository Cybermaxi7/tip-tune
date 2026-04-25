use soroban_sdk::{symbol_short, Env};

use crate::types::{DistributionEvent, TipEscrow, TipEvent};

pub fn escrow_created(env: &Env, escrow: TipEscrow) {
    env.events()
        .publish((symbol_short!("escrow"), symbol_short!("created")), escrow);
}

pub fn escrow_released(env: &Env, escrow: TipEscrow) {
    env.events()
        .publish((symbol_short!("escrow"), symbol_short!("release")), escrow);
}

pub fn escrow_refunded(env: &Env, escrow: TipEscrow) {
    env.events()
        .publish((symbol_short!("escrow"), symbol_short!("refund")), escrow);
}

pub fn escrow_disputed(env: &Env, escrow: TipEscrow) {
    env.events()
        .publish((symbol_short!("escrow"), symbol_short!("dispute")), escrow);
}

pub fn tip_sent(env: &Env, event: TipEvent) {
    env.events().publish((symbol_short!("tip"),), event);
}

pub fn distribution_recorded(env: &Env, event: DistributionEvent) {
    env.events().publish((symbol_short!("tip_dist"),), event);
}
