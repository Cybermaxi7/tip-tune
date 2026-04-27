#![no_std]

use crate::errors::Error;
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};

pub mod allowance;
pub mod errors;
pub mod metadata;
pub mod roles;
pub mod storage;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Metadata,
    TotalSupply,
    Balance(Address),
    Allowance(Address, Address), // from, spender
    SupplyCap,
    Paused,
    PendingAdmin,
    MintAdmin,
    PauseAdmin,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferEvent {
    pub from: Address,
    pub to: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintEvent {
    pub recipient: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BurnEvent {
    pub from: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferEvent {
    pub from: Address,
    pub to: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseEvent {
    pub paused: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleEvent {
    pub role: soroban_sdk::Symbol,
    pub account: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminHandoffEvent {
    pub current_admin: Address,
    pub pending_admin: Address,
}

#[contract]
pub struct RewardToken;

#[contractimpl]
impl RewardToken {
    pub fn initialize(
        env: Env,
        admin: Address,
        total_supply: i128,
        supply_cap: Option<i128>,
        name: String,
        symbol: String,
        decimals: u32,
    ) -> Result<(), Error> {
        metadata::init_metadata(&env, name, symbol, decimals)?;

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        if total_supply < 0 {
            return Err(Error::NegativeSupply);
        }

        // Validate supply cap if provided
        if let Some(cap) = supply_cap {
            if cap < total_supply {
                return Err(Error::CapBelowSupply);
            }
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &total_supply);
        env.storage().instance().set(&DataKey::Paused, &false);

        if let Some(cap) = supply_cap {
            env.storage().instance().set(&DataKey::SupplyCap, &cap);
        }

        storage::write_balance(&env, &admin, total_supply);

        Ok(())
    }

    /// Transfer tokens from one account to another.
    /// Requires authorization from the sender.
    /// Not allowed when contract is paused.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();

        // Check if contract is paused
        if Self::is_paused(env.clone()) {
            return Err(Error::Paused);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        if from == to {
            return Err(Error::SelfTransfer);
        }

        let from_balance = storage::read_balance(&env, &from);
        if from_balance < amount {
            return Err(Error::InsufficientBalance);
        }

        storage::write_balance(&env, &from, from_balance - amount);

        let to_balance = storage::read_balance(&env, &to);
        let new_to_balance = to_balance.checked_add(amount).expect("Balance overflow");
        storage::write_balance(&env, &to, new_to_balance);

        // Emit transfer event
        env.events().publish(
            ("transfer",),
            TransferEvent {
                from: from.clone(),
                to: to.clone(),
                amount,
            },
        );

        Ok(())
    }

    /// Get the balance of an account.
    pub fn balance(env: Env, account: Address) -> i128 {
        storage::read_balance(&env, &account)
    }

    /// Mint new reward tokens to an account.
    /// Only the admin can call this.
    /// Not allowed when contract is paused.
    /// Respects supply cap if configured.
    pub fn mint_reward(env: Env, recipient: Address, amount: i128) -> Result<(), Error> {
        roles::mint_authority(&env).require_auth();

        // Check if contract is paused
        if Self::is_paused(env.clone()) {
            return Err(Error::Paused);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let current_supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);

        // Check supply cap if configured
        if let Some(cap_entry) = env.storage().instance().get::<_, i128>(&DataKey::SupplyCap) {
            let new_supply = current_supply
                .checked_add(amount)
                .ok_or(Error::SupplyOverflow)?;
            if new_supply > cap_entry {
                return Err(Error::SupplyCapExceeded);
            }
        }

        let recipient_balance = storage::read_balance(&env, &recipient);
        let new_recipient_balance = recipient_balance
            .checked_add(amount)
            .ok_or(Error::BalanceOverflow)?;
        storage::write_balance(&env, &recipient, new_recipient_balance);

        // Update total supply
        let new_supply = current_supply
            .checked_add(amount)
            .ok_or(Error::SupplyOverflow)?;
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);

        // Emit mint event
        env.events().publish(
            ("mint",),
            MintEvent {
                recipient: recipient.clone(),
                amount,
            },
        );

        Ok(())
    }

    /// Burn tokens from an account.
    /// Requires authorization from the token holder.
    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let from_balance = storage::read_balance(&env, &from);
        if from_balance < amount {
            return Err(Error::InsufficientBalance);
        }
        storage::write_balance(&env, &from, from_balance - amount);

        // Update total supply
        let total_supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        let new_supply = total_supply
            .checked_sub(amount)
            .ok_or(Error::SupplyUnderflow)?;
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);

        // Emit burn event
        env.events().publish(
            ("burn",),
            BurnEvent {
                from: from.clone(),
                amount,
            },
        );

        Ok(())
    }

    /// Approve a spender to transfer tokens on behalf of the token holder.
    pub fn approve(env: Env, from: Address, spender: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();

        if amount < 0 {
            return Err(Error::NegativeAllowance);
        }

        if from == spender {
            return Err(Error::SelfApprove);
        }

        storage::write_allowance(&env, &from, &spender, amount);

        Ok(())
    }

    /// Get the allowance of a spender for a token holder.
    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        storage::read_allowance(&env, &from, &spender)
    }

    /// Transfer tokens on behalf of another account.
    /// Requires authorization from the spender.
    /// Decreases the allowance accordingly.
    /// Not allowed when contract is paused.
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        spender.require_auth();

        // Check if contract is paused
        if Self::is_paused(env.clone()) {
            return Err(Error::Paused);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        if from == to {
            return Err(Error::SelfTransfer);
        }

        let allowance = storage::read_allowance(&env, &from, &spender);
        if allowance < amount {
            return Err(Error::InsufficientAllowance);
        }

        let from_balance = storage::read_balance(&env, &from);
        if from_balance < amount {
            return Err(Error::InsufficientBalance);
        }

        // Update allowance
        let new_allowance = allowance
            .checked_sub(amount)
            .ok_or(Error::AllowanceUnderflow)?;
        storage::write_allowance(&env, &from, &spender, new_allowance);

        // Update balances
        let new_from_balance = from_balance
            .checked_sub(amount)
            .ok_or(Error::InsufficientBalance)?;
        storage::write_balance(&env, &from, new_from_balance);

        let to_balance = storage::read_balance(&env, &to);
        let new_to_balance = to_balance
            .checked_add(amount)
            .ok_or(Error::BalanceOverflow)?;
        storage::write_balance(&env, &to, new_to_balance);

        // Emit transfer event
        env.events().publish(
            ("transfer",),
            TransferEvent {
                from: from.clone(),
                to: to.clone(),
                amount,
            },
        );

        Ok(())
    }

    /// Admin transfer: Move tokens between accounts without balance limit.
    /// Only the admin can call this.
    /// Useful for corrections and operational needs.
    pub fn admin_transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        roles::admin(&env).require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        if from == to {
            return Err(Error::SelfTransfer);
        }

        let from_balance = storage::read_balance(&env, &from);
        if from_balance < amount {
            return Err(Error::InsufficientBalance);
        }

        let to_balance = storage::read_balance(&env, &to);
        let new_to_balance = to_balance
            .checked_add(amount)
            .ok_or(Error::BalanceOverflow)?;

        storage::write_balance(&env, &from, from_balance - amount);
        storage::write_balance(&env, &to, new_to_balance);

        // Emit admin transfer event
        env.events().publish(
            ("admin_transfer",),
            AdminTransferEvent {
                from: from.clone(),
                to: to.clone(),
                amount,
            },
        );

        Ok(())
    }

    /// Get the current total supply.
    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    /// Get the supply cap (if configured).
    pub fn supply_cap(env: Env) -> Option<i128> {
        env.storage().instance().get(&DataKey::SupplyCap)
    }

    /// Get the admin address.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    /// Pause the contract (prevents transfers and mints).
    /// Only the admin can call this.
    pub fn pause(env: Env) {
        roles::pause_authority(&env).require_auth();

        env.storage().instance().set(&DataKey::Paused, &true);

        // Emit pause event
        env.events()
            .publish(("pause",), PauseEvent { paused: true });
    }

    /// Unpause the contract.
    /// Only the admin can call this.
    pub fn unpause(env: Env) {
        roles::pause_authority(&env).require_auth();

        env.storage().instance().set(&DataKey::Paused, &false);

        // Emit unpause event
        env.events()
            .publish(("unpause",), PauseEvent { paused: false });
    }

    /// Check if the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    pub fn transfer_admin(env: Env, pending_admin: Address) -> Result<(), Error> {
        let current_admin = roles::admin(&env);
        current_admin.require_auth();
        roles::set_pending_admin(&env, &pending_admin);
        env.events().publish(
            (symbol_short!("adm_xfer"),),
            AdminHandoffEvent {
                current_admin,
                pending_admin,
            },
        );
        Ok(())
    }

    pub fn accept_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        new_admin.require_auth();
        let pending_admin = roles::pending_admin(&env).ok_or(Error::NoPendingAdmin)?;
        if pending_admin != new_admin {
            return Err(Error::Unauthorized);
        }
        roles::set_admin(&env, &new_admin);
        roles::clear_pending_admin(&env);
        env.events().publish(
            (symbol_short!("admin"), symbol_short!("accept")),
            RoleEvent {
                role: symbol_short!("admin"),
                account: Some(new_admin),
            },
        );
        Ok(())
    }

    pub fn set_mint_admin(env: Env, mint_admin: Option<Address>) -> Result<(), Error> {
        roles::admin(&env).require_auth();
        roles::set_mint_admin(&env, mint_admin.clone());
        env.events().publish(
            (symbol_short!("role"), symbol_short!("mint")),
            RoleEvent {
                role: symbol_short!("mint"),
                account: mint_admin,
            },
        );
        Ok(())
    }

    pub fn set_pause_admin(env: Env, pause_admin: Option<Address>) -> Result<(), Error> {
        roles::admin(&env).require_auth();
        roles::set_pause_admin(&env, pause_admin.clone());
        env.events().publish(
            (symbol_short!("role"), symbol_short!("pause")),
            RoleEvent {
                role: symbol_short!("pause"),
                account: pause_admin,
            },
        );
        Ok(())
    }

    pub fn pending_admin(env: Env) -> Option<Address> {
        roles::pending_admin(&env)
    }

    pub fn mint_admin(env: Env) -> Address {
        roles::mint_authority(&env)
    }

pub fn pause_admin(env: Env) -> Address {
        roles::pause_authority(&env)
    }

    /// Get token name.
    pub fn name(env: Env) -> String {
        metadata::get_metadata(&env)
            .map(|m| m.name)
            .unwrap_or_else(|| String::from_str(&env, ""))
    }

    /// Get token symbol.
    pub fn symbol(env: Env) -> String {
        metadata::get_metadata(&env)
            .map(|m| m.symbol)
            .unwrap_or_else(|| String::from_str(&env, ""))
    }

    /// Get token decimals.
    pub fn decimals(env: Env) -> u32 {
        metadata::get_metadata(&env).map(|m| m.decimals).unwrap_or(0)
    }

    /// Get contract version.
    pub fn contract_version(env: Env) -> u32 {
        metadata::get_metadata(&env)
            .map(|m| m.contract_version)
            .unwrap_or(0)
    }

    /// Increase allowance monotonically (safe against race-condition overwrites).
    pub fn increase_allowance(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
    ) -> Result<i128, Error> {
        from.require_auth();
        allowance::increase_allowance(&env, &from, &spender, amount)
    }

    /// Decrease allowance monotonically (safe against race-condition overwrites).
    pub fn decrease_allowance(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
    ) -> Result<i128, Error> {
        from.require_auth();
        allowance::decrease_allowance(&env, &from, &spender, amount)
    }
}

#[cfg(test)]
mod test;
