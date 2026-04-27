#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

fn register_client<'a>(env: &'a Env) -> RewardTokenClient<'a> {
    let contract_id = env.register_contract(None, RewardToken);
    RewardTokenClient::new(env, &contract_id)
}

fn init_default<'a>(env: &'a Env) -> (RewardTokenClient<'a>, Address, Address, Address) {
    let client = register_client(env);
    let admin = Address::generate(env);
    let user1 = Address::generate(env);
    let user2 = Address::generate(env);
    env.mock_all_auths();
    let name = String::from_str(env, "Reward Token");
    let symbol = String::from_str(env, "RWT");
    client.initialize(&admin, &1000, &None, &name, &symbol, &7);
    (client, admin, user1, user2)
}

fn init_with_tokens<'a>(env: &'a Env) -> (RewardTokenClient<'a>, Address, Address, Address) {
    let (client, admin, user1, user2) = init_default(env);
    // Transfer initial tokens to user1 and user2 so tests can use them
    client.transfer(&admin, &user1, &500);
    client.transfer(&admin, &user2, &500);
    (client, admin, user1, user2)
}

#[test]
fn test_metadata_initialization_and_getters() {
    let env = Env::default();
    let (client, admin, _, _) = init_default(&env);

    assert_eq!(client.name(), String::from_str(&env, "Reward Token"));
    assert_eq!(client.symbol(), String::from_str(&env, "RWT"));
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.contract_version(), 1);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.is_paused(), false);
}

#[test]
fn test_metadata_rejects_empty_name() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let name = String::from_str(&env, "");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    let result = client.try_initialize(&admin, &1000, &None, &name, &symbol, &7);
    assert!(result.is_err());
}

#[test]
fn test_metadata_rejects_empty_symbol() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "");

    env.mock_all_auths();
    let result = client.try_initialize(&admin, &1000, &None, &name, &symbol, &7);
    assert!(result.is_err());
}

#[test]
fn test_metadata_rejects_invalid_decimals() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    // decimals 16 > 15 should be rejected
    let result = client.try_initialize(&admin, &1000, &None, &name, &symbol, &16);
    assert!(result.is_err());

    // decimals 15 is valid
    let result2 = client.try_initialize(&admin, &1000, &None, &name, &symbol, &15);
    assert!(result2.is_ok());
}

#[test]
fn test_metadata_rejects_double_init() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    assert!(client
        .try_initialize(&admin, &1000, &None, &name, &symbol, &7)
        .is_ok());

    let other = Address::generate(&env);
    let result = client.try_initialize(&other, &500, &None, &name, &symbol, &7);
    assert!(result.is_err());
}

#[test]
fn test_increase_allowance() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_with_tokens(&env);

    // admin already transferred 500+500 to users, user1 has 500
    let new_allocation = client.increase_allowance(&user1, &user2, &200);
    assert_eq!(new_allocation, 200);

    let _more = client.increase_allowance(&user1, &user2, &100);
    assert_eq!(client.allowance(&user1, &user2), 300);

    // Use partial allowance
    client.transfer_from(&user2, &user1, &admin, &150);
    assert_eq!(client.allowance(&user1, &user2), 150);

    // Increase again after use
    let new_alloc = client.increase_allowance(&user1, &user2, &50);
    assert_eq!(new_alloc, 200);
    assert_eq!(client.allowance(&user1, &user2), 200);
}

#[test]
fn test_decrease_allowance() {
    let env = Env::default();
    let (client, _admin, user1, user2) = init_with_tokens(&env);

    client.approve(&user1, &user2, &300);

    let remaining = client.decrease_allowance(&user1, &user2, &100);
    assert_eq!(remaining, 200);

    // Decrease to zero
    let zero = client.decrease_allowance(&user1, &user2, &200);
    assert_eq!(zero, 0);
    assert_eq!(client.allowance(&user1, &user2), 0);
}

#[test]
fn test_decrease_allowance_underflow_rejected() {
    let env = Env::default();
    let (client, _admin, user1, user2) = init_with_tokens(&env);

    client.approve(&user1, &user2, &100);

    let result = client.try_decrease_allowance(&user1, &user2, &200);
    assert!(result.is_err());
    assert_eq!(client.allowance(&user1, &user2), 100);
}

#[test]
fn test_increase_allowance_self_approve_rejected() {
    let env = Env::default();
    let (client, _, user1, _) = init_default(&env);

    let result = client.try_increase_allowance(&user1, &user1, &100);
    assert!(result.is_err());
}

#[test]
fn test_decrease_allowance_self_approve_rejected() {
    let env = Env::default();
    let (client, _, user1, _) = init_default(&env);

    let result = client.try_decrease_allowance(&user1, &user1, &100);
    assert!(result.is_err());
}

#[test]
fn test_increase_allowance_negative_amount() {
    let env = Env::default();
    let (client, _, user1, user2) = init_default(&env);

    let result = client.try_increase_allowance(&user1, &user2, &-50);
    assert!(result.is_err());
}

#[test]
fn test_decrease_allowance_negative_amount() {
    let env = Env::default();
    let (client, _, user1, user2) = init_default(&env);

    client.approve(&user1, &user2, &100);
    let result = client.try_decrease_allowance(&user1, &user2, &-50);
    assert!(result.is_err());
}

#[test]
fn test_basic_operations() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_default(&env);

    assert_eq!(client.balance(&admin), 1000);
    assert_eq!(client.balance(&user1), 0);
    assert_eq!(client.total_supply(), 1000);
    assert_eq!(client.supply_cap(), None);

    // Transfer by admin
    assert!(client.try_transfer(&admin, &user1, &100).is_ok());
    assert_eq!(client.balance(&admin), 900);
    assert_eq!(client.balance(&user1), 100);
    assert_eq!(client.total_supply(), 1000);

    // Transfer by user
    assert!(client.try_transfer(&user1, &user2, &50).is_ok());
    assert_eq!(client.balance(&user1), 50);
    assert_eq!(client.balance(&user2), 50);
    assert_eq!(client.total_supply(), 1000);

    // Mint reward
    assert!(client.try_mint_reward(&user1, &200).is_ok());
    assert_eq!(client.balance(&user1), 250);
    assert_eq!(client.total_supply(), 1200);

    // Burn
    assert!(client.try_burn(&user1, &50).is_ok());
    assert_eq!(client.balance(&user1), 200);
    assert_eq!(client.total_supply(), 1150);

    // Approve and TransferFrom
    assert!(client.try_approve(&user1, &user2, &100).is_ok());
    assert_eq!(client.allowance(&user1, &user2), 100);

    assert!(client
        .try_transfer_from(&user2, &user1, &admin, &50)
        .is_ok());
    assert_eq!(client.balance(&user1), 150);
    assert_eq!(client.balance(&admin), 950);
    assert_eq!(client.allowance(&user1, &user2), 50);
    assert_eq!(client.total_supply(), 1150);
}

#[test]
fn test_supply_cap() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    assert!(client
        .try_initialize(&admin, &1000, &Some(2000), &name, &symbol, &7)
        .is_ok());
    assert_eq!(client.supply_cap(), Some(2000));
    assert_eq!(client.total_supply(), 1000);

    assert!(client.try_mint_reward(&user1, &900).is_ok());
    assert_eq!(client.balance(&user1), 900);
    assert_eq!(client.total_supply(), 1900);
}

#[test]
fn test_supply_cap_fails_when_exceeded() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    assert!(client
        .try_initialize(&admin, &1000, &Some(2000), &name, &symbol, &7)
        .is_ok());
    assert!(client.try_mint_reward(&user1, &900).is_ok());

    let result = client.try_mint_reward(&user1, &200);
    assert!(result.is_err());
}

#[test]
#[should_panic]
fn test_supply_cap_validation_on_init() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    client.initialize(&admin, &2000, &Some(1000), &name, &symbol, &7);
}

#[test]
fn test_pause_functionality() {
    let env = Env::default();
    let (client, admin, user1, _) = init_default(&env);

    assert_eq!(client.is_paused(), false);
    client.pause();
    assert_eq!(client.is_paused(), true);
    client.unpause();
    assert_eq!(client.is_paused(), false);
    client.transfer(&admin, &user1, &100);
    assert_eq!(client.balance(&user1), 100);
}

#[test]
#[should_panic]
fn test_transfer_panics_while_paused() {
    let env = Env::default();
    let (client, admin, user1, _) = init_default(&env);

    client.pause();
    client.transfer(&admin, &user1, &100);
}

#[test]
#[should_panic]
fn test_mint_panics_while_paused() {
    let env = Env::default();
    let (client, _admin, user1, _) = init_default(&env);

    client.pause();
    client.mint_reward(&user1, &100);
}

#[test]
fn test_admin_transfer() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_default(&env);

    client.transfer(&admin, &user1, &500);
    assert_eq!(client.balance(&user1), 500);

    client.admin_transfer(&user1, &user2, &300);
    assert_eq!(client.balance(&user1), 200);
    assert_eq!(client.balance(&user2), 300);
    assert_eq!(client.total_supply(), 1000);
}

#[test]
fn test_allowance_edge_cases() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_default(&env);

    client.transfer(&admin, &user1, &500);
    client.approve(&user1, &user2, &500);
    client.transfer_from(&user2, &user1, &admin, &500);
    assert_eq!(client.balance(&user1), 0);
    assert_eq!(client.allowance(&user1, &user2), 0);
}

#[test]
#[should_panic]
fn test_transfer_from_panics_without_allowance() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_default(&env);

    client.transfer(&admin, &user1, &500);
    client.approve(&user1, &user2, &500);
    client.transfer_from(&user2, &user1, &admin, &500);
    client.transfer_from(&user2, &user1, &admin, &1);
}

#[test]
fn test_zero_approve_clears_allowance() {
    let env = Env::default();
    let (client, admin, user1, _) = init_default(&env);

    client.approve(&admin, &user1, &100);
    client.approve(&admin, &user1, &0);
    assert_eq!(client.allowance(&admin, &user1), 0);
}

#[test]
#[should_panic]
fn test_zero_transfer_panics() {
    let env = Env::default();
    let (client, admin, user1, _) = init_default(&env);
    client.transfer(&admin, &user1, &0);
}

#[test]
#[should_panic]
fn test_negative_transfer_panics() {
    let env = Env::default();
    let (client, admin, user1, _) = init_default(&env);
    client.transfer(&admin, &user1, &-100);
}

#[test]
#[should_panic]
fn test_zero_mint_panics() {
    let env = Env::default();
    let (client, _, user1, _) = init_default(&env);
    client.mint_reward(&user1, &0);
}

#[test]
#[should_panic]
fn test_zero_burn_panics() {
    let env = Env::default();
    let (client, admin, user1, _) = init_default(&env);
    client.transfer(&admin, &user1, &100);
    client.burn(&user1, &0);
}

#[test]
fn test_burn_reduces_supply() {
    let env = Env::default();
    let (client, admin, user1, _) = init_default(&env);

    client.transfer(&admin, &user1, &400);
    client.burn(&user1, &200);

    assert_eq!(client.balance(&user1), 200);
    assert_eq!(client.total_supply(), 800);
    assert_eq!(client.balance(&admin), 600);
}

#[test]
#[should_panic]
fn test_transfer_to_self_panics() {
    let env = Env::default();
    let (client, admin, _, _) = init_default(&env);
    client.transfer(&admin, &admin, &100);
}

#[test]
#[should_panic]
fn test_approve_self_panics() {
    let env = Env::default();
    let (client, admin, _, _) = init_default(&env);
    client.approve(&admin, &admin, &100);
}

#[test]
#[should_panic]
fn test_transfer_panics_with_insufficient_balance() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_default(&env);
    client.transfer(&admin, &user1, &100);
    client.transfer(&user1, &user2, &200);
}

#[test]
#[should_panic]
fn test_transfer_from_panics_with_insufficient_allowance() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_default(&env);
    client.transfer(&admin, &user1, &100);
    client.approve(&user1, &user2, &100);
    client.transfer_from(&user2, &user1, &admin, &150);
}

#[test]
#[should_panic]
fn test_transfer_from_panics_with_insufficient_balance() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_default(&env);
    client.transfer(&admin, &user1, &100);
    client.approve(&user1, &user2, &150);
    client.transfer_from(&user2, &user1, &admin, &150);
}

#[test]
fn test_multiple_operations_consistency() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    client.initialize(&admin, &10000, &Some(15000), &name, &symbol, &7);

    client.transfer(&admin, &user1, &3000);
    client.transfer(&admin, &user2, &2000);
    client.mint_reward(&user3, &1000);

    assert_eq!(client.total_supply(), 11000);
    assert_eq!(client.balance(&admin), 5000);
    assert_eq!(client.balance(&user1), 3000);
    assert_eq!(client.balance(&user2), 2000);
    assert_eq!(client.balance(&user3), 1000);

    client.approve(&user1, &user2, &2000);
    client.transfer_from(&user2, &user1, &user3, &1000);

    assert_eq!(client.balance(&user1), 2000);
    assert_eq!(client.balance(&user3), 2000);
    assert_eq!(client.allowance(&user1, &user2), 1000);
    assert_eq!(client.total_supply(), 11000);

    client.burn(&user1, &500);
    assert_eq!(client.balance(&user1), 1500);
    assert_eq!(client.total_supply(), 10500);
}

#[test]
#[should_panic]
fn test_multiple_operations_panics_when_exceeding_supply_cap() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");

    env.mock_all_auths();
    client.initialize(&admin, &10000, &Some(15000), &name, &symbol, &7);
    client.mint_reward(&user1, &1000);
    client.mint_reward(&user1, &5000);
}

#[test]
fn test_admin_handoff_acceptance() {
    let env = Env::default();
    let (client, admin, _, user) = init_default(&env);
    let new_admin = Address::generate(&env);

    client.transfer_admin(&new_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    client.accept_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);
    client.admin_transfer(&admin, &user, &100);
    assert_eq!(client.balance(&user), 100);
}

#[test]
fn test_accept_admin_rejects_non_pending_account() {
    let env = Env::default();
    let (client, admin, _, _) = init_default(&env);
    let pending = Address::generate(&env);
    let other = Address::generate(&env);

    client.transfer_admin(&pending);
    assert!(client.try_accept_admin(&other).is_err());
    assert_eq!(client.admin(), admin);
}

#[test]
fn test_privileged_action_requires_auth() {
    let env = Env::default();
    let client = register_client(&env);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let name = String::from_str(&env, "Reward Token");
    let symbol = String::from_str(&env, "RWT");
    // NO mock_all_auths - so set_mint_admin should fail
    client.initialize(&admin, &1000, &None, &name, &symbol, &7);
    assert!(client.try_set_mint_admin(&Some(user)).is_err());
}

#[test]
fn test_role_specific_permissions() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, minter, pauser) = init_default(&env);
    let user = Address::generate(&env);

    client.set_mint_admin(&Some(minter.clone()));
    client.set_pause_admin(&Some(pauser.clone()));

    assert_eq!(client.mint_admin(), minter);
    assert_eq!(client.pause_admin(), pauser);

    client.mint_reward(&user, &100);
    client.pause();

    assert_eq!(client.balance(&user), 100);
    assert!(client.is_paused());
}

#[test]
fn test_ttl_helper_balance_persistence() {
    let env = Env::default();
    let (client, _admin, user1, user2) = init_with_tokens(&env);

    // Write via mint (uses write_balance)
    client.mint_reward(&user1, &100);
    assert_eq!(client.balance(&user1), 600);

    // Write via burn (uses write_balance)
    client.burn(&user1, &100);
    assert_eq!(client.balance(&user1), 500);

    // Write via admin_transfer (uses write_balance)
    client.admin_transfer(&user1, &user2, &200);
    assert_eq!(client.balance(&user1), 300);
    assert_eq!(client.balance(&user2), 700);
}

#[test]
fn test_ttl_helper_allowance_persistence() {
    let env = Env::default();
    let (client, admin, user1, user2) = init_with_tokens(&env);

    // Read via allowance getter (uses read_allowance)
    client.approve(&user1, &user2, &200);
    assert_eq!(client.allowance(&user1, &user2), 200);

    // Read again (uses read_allowance)
    assert_eq!(client.allowance(&user1, &user2), 200);

    // Write via decrease in transfer_from
    client.transfer_from(&user2, &user1, &admin, &100);
    assert_eq!(client.allowance(&user1, &user2), 100);

    // Write via approve (uses write_allowance)
    client.approve(&user1, &user2, &50);
    assert_eq!(client.allowance(&user1, &user2), 50);
}