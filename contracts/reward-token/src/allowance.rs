use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::storage;

/// Increase allowance monotonically without overwriting races.
/// Returns the new allowance amount.
pub fn increase_allowance(
    env: &Env,
    from: &Address,
    spender: &Address,
    amount: i128,
) -> Result<i128, Error> {
    if amount < 0 {
        return Err(Error::NegativeAllowance);
    }
    if from == spender {
        return Err(Error::SelfApprove);
    }

    let current = storage::read_allowance(env, from, spender);
    let new_allowance = current
        .checked_add(amount)
        .ok_or(Error::AllowanceOverflow)?;
    storage::write_allowance(env, from, spender, new_allowance);
    Ok(new_allowance)
}

/// Decrease allowance monotonically without overwriting races.
/// Returns the new allowance amount.
pub fn decrease_allowance(
    env: &Env,
    from: &Address,
    spender: &Address,
    amount: i128,
) -> Result<i128, Error> {
    if amount < 0 {
        return Err(Error::NegativeAllowance);
    }
    if from == spender {
        return Err(Error::SelfApprove);
    }

    let current = storage::read_allowance(env, from, spender);
    if amount > current {
        return Err(Error::AllowanceDecreaseExceedsCurrent);
    }
    let new_allowance = current
        .checked_sub(amount)
        .ok_or(Error::AllowanceUnderflow)?;
    storage::write_allowance(env, from, spender, new_allowance);
    Ok(new_allowance)
}