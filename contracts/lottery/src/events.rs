use soroban_sdk::{symbol_short, Address, Env, String};

pub fn emit_lottery_created(env: &Env, pool_id: String, artist: &Address) {
    env.events().publish(
        (symbol_short!("lottery"), symbol_short!("created")),
        (pool_id, artist.clone()),
    );
}

pub fn emit_entry(env: &Env, pool_id: String, tipper: &Address, tickets: u32, amount: i128) {
    env.events().publish(
        (symbol_short!("lottery"), symbol_short!("entry")),
        (pool_id, tipper.clone(), tickets, amount),
    );
}

pub fn emit_winner_drawn(env: &Env, pool_id: String, winner: &Address) {
    env.events().publish(
        (symbol_short!("lottery"), symbol_short!("winner")),
        (pool_id, winner.clone()),
    );
}

pub fn emit_prize_claimed(env: &Env, pool_id: String, winner: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("lottery"), symbol_short!("prize")),
        (pool_id, winner.clone(), amount),
    );
}

pub fn emit_refund_claimed(env: &Env, pool_id: String, tipper: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("lottery"), symbol_short!("refund")),
        (pool_id, tipper.clone(), amount),
    );
}

pub fn emit_cancelled(env: &Env, pool_id: String) {
    env.events()
        .publish((symbol_short!("lottery"), symbol_short!("cancel")), pool_id);
}
