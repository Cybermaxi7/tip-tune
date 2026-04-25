use soroban_sdk::{token, Address, Env, String};

use crate::{
    events, storage,
    types::{Asset, Error, EscrowStatus, TipEscrow},
};

fn transfer_escrowed_asset(env: &Env, escrow: &TipEscrow, recipient: &Address) {
    match &escrow.asset {
        Asset::Token(token_address) => {
            let token_client = token::Client::new(env, token_address);
            token_client.transfer(&env.current_contract_address(), recipient, &escrow.amount);
        }
    }
}

fn load_pending(env: &Env, escrow_id: &String) -> Result<TipEscrow, Error> {
    let escrow = storage::get_escrow(env, escrow_id.clone()).ok_or(Error::EscrowNotFound)?;
    if escrow.status != EscrowStatus::Pending {
        return Err(Error::InvalidStatus);
    }
    Ok(escrow)
}

pub fn release(env: &Env, escrow_id: String, caller: Address) -> Result<(), Error> {
    caller.require_auth();

    let mut escrow = load_pending(env, &escrow_id)?;
    if caller != escrow.artist {
        return Err(Error::InvalidStatus);
    }
    if env.ledger().timestamp() < escrow.release_time {
        return Err(Error::ReleaseTooEarly);
    }

    transfer_escrowed_asset(env, &escrow, &escrow.artist);
    escrow.status = EscrowStatus::Released;
    storage::save_escrow(env, escrow_id, &escrow);
    events::escrow_released(env, escrow);

    Ok(())
}

pub fn refund(env: &Env, escrow_id: String, caller: Address) -> Result<(), Error> {
    caller.require_auth();

    let mut escrow = load_pending(env, &escrow_id)?;
    if caller != escrow.tipper {
        return Err(Error::InvalidStatus);
    }

    transfer_escrowed_asset(env, &escrow, &escrow.tipper);
    escrow.status = EscrowStatus::Refunded;
    storage::save_escrow(env, escrow_id, &escrow);
    events::escrow_refunded(env, escrow);

    Ok(())
}

pub fn dispute(env: &Env, escrow_id: String, caller: Address) -> Result<(), Error> {
    caller.require_auth();

    let mut escrow = load_pending(env, &escrow_id)?;
    if caller != escrow.tipper && caller != escrow.artist {
        return Err(Error::InvalidStatus);
    }

    escrow.status = EscrowStatus::Disputed;
    storage::save_escrow(env, escrow_id, &escrow);
    events::escrow_disputed(env, escrow);

    Ok(())
}
