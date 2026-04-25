use soroban_sdk::{Address, Env, String, symbol_short};

pub fn stream_started(
    env: &Env,
    _stream_id: &String,
    _listener: &Address,
    _artist: &Address,
    _rate_per_second: i128,
) {
    env.events().publish(
        (symbol_short!("STREAM"), symbol_short!("START")),
        (),
    );
}

pub fn stream_stopped(
    env: &Env,
    _stream_id: &String,
    _listener: &Address,
    _artist: &Address,
    _amount_paid: i128,
    _refunded: i128,
) {
    env.events().publish(
        (symbol_short!("STREAM"), symbol_short!("STOP")),
        (),
    );
}

pub fn payment_settled(
    env: &Env,
    _stream_id: &String,
    _artist: &Address,
    _amount: i128,
) {
    env.events().publish(
        (symbol_short!("STREAM"), symbol_short!("PAY")),
        (),
    );
}
