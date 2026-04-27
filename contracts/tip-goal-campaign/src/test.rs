#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, String,
};

fn setup_test_with_token(initial_balance: i128) -> (Env, TipGoalCampaignContractClient, Address, Address, token::Client) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipGoalCampaignContract);
    let client = TipGoalCampaignContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let contributor = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    // Mint initial tokens to contributor
    token_admin_client.mint(&contributor, &initial_balance);

    (env, client, artist, contributor, token_client)
}

#[test]
fn test_create_campaign() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TipGoalCampaignContract);
    let client = TipGoalCampaignContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let token = Address::generate(&env);
    let campaign_id = client.create_campaign(&artist, &token, &5000, &2000, &0);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.artist, artist);
    assert_eq!(campaign.token, token);
    assert_eq!(campaign.goal_amount, 5000);
    assert_eq!(campaign.deadline, 2000);
    assert_eq!(campaign.current_amount, 0);
    assert_eq!(campaign.status, CampaignStatus::Active);
    assert_eq!(campaign.contributions.len(), 0);
    assert_eq!(campaign.hard_cap, 0);
    assert_eq!(campaign.funds_released, false);
    assert_eq!(client.get_campaign_count(), 1);
}

#[test]
fn test_contribute_transfers_tokens() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    let initial_contract_balance = token_client.balance(&env.contract_id());
    let initial_contributor_balance = token_client.balance(&contributor);

    client.contribute(&campaign_id, &contributor, &1500);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.current_amount, 1500);
    assert_eq!(campaign.contributions.len(), 1);
    assert_eq!(campaign.contributions.get(0).unwrap().contributor, contributor);
    assert_eq!(campaign.contributions.get(0).unwrap().amount, 1500);

    // Check balances: contributor lost 1500, contract gained 1500
    assert_eq!(
        token_client.balance(&contributor),
        initial_contributor_balance - 1500
    );
    assert_eq!(
        token_client.balance(&env.contract_id()),
        initial_contract_balance + 1500
    );
}

#[test]
fn test_multiple_contributions() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &2000);
    client.contribute(&campaign_id, &contributor, &1500);
    client.contribute(&campaign_id, &contributor, &500);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.current_amount, 4000);
    assert_eq!(campaign.contributions.len(), 3);

    // Aggregated total matches
    let agg = client.get_contributor_total(&campaign_id, &contributor);
    assert_eq!(agg, 4000);
}

#[test]
fn test_finalize_goal_met_releases_funds() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &1000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &1000);

    let initial_artist_balance = token_client.balance(&artist);
    let initial_contract_balance = token_client.balance(&env.contract_id());

    let result = client.finalize_campaign(&campaign_id);
    assert_eq!(result, CampaignResult::GoalMet);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Succeeded);
    assert_eq!(campaign.funds_released, true);

    // Artist received funds
    assert_eq!(
        token_client.balance(&artist),
        initial_artist_balance + 1000
    );
    // Contract paid out
    assert_eq!(
        token_client.balance(&env.contract_id()),
        initial_contract_balance - 1000
    );
}

#[test]
fn test_finalize_goal_not_met_after_deadline() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &1000);

    // Advance time past deadline
    env.ledger().with_mut(|li| {
        li.timestamp = 2001;
    });

    let result = client.finalize_campaign(&campaign_id);
    assert_eq!(result, CampaignResult::GoalNotMet);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Failed);
    assert_eq!(campaign.funds_released, false);

    // Contract still holds contributor's funds
    assert_eq!(token_client.balance(&env.contract_id()), 1000);
}

#[test]
fn test_cannot_finalize_active_early_without_goal() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &100);

    // Cannot finalize before deadline if goal is not met
    let result = client.try_finalize_campaign(&campaign_id);
    assert_eq!(result, Err(Ok(Error::CampaignNotExpired)));
}

#[test]
fn test_cannot_contribute_after_deadline() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    // Advance time past deadline
    env.ledger().with_mut(|li| {
        li.timestamp = 2001;
    });

    let result = client.try_contribute(&campaign_id, &contributor, &100);
    assert_eq!(result, Err(Ok(Error::DeadlinePassed)));
}

#[test]
fn test_cannot_contribute_to_finalized() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &1000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &1000);
    client.finalize_campaign(&campaign_id);

    let result = client.try_contribute(&campaign_id, &contributor, &500);
    assert_eq!(result, Err(Ok(Error::CampaignAlreadyFinalized)));
}

#[test]
fn test_cannot_double_finalize() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &1000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &1000);
    client.finalize_campaign(&campaign_id);

    let result = client.try_finalize_campaign(&campaign_id);
    assert_eq!(result, Err(Ok(Error::CampaignAlreadyFinalized)));
}

#[test]
fn test_invalid_goal_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TipGoalCampaignContract);
    let client = TipGoalCampaignContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let token = Address::generate(&env);

    let result = client.try_create_campaign(&artist, &token, &0, &2000, &0);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));

    let result = client.try_create_campaign(&artist, &token, &-100, &2000, &0);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn test_invalid_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TipGoalCampaignContract);
    let client = TipGoalCampaignContractClient::new(&env, &contract_id);

    let artist = Address::generate(&env);
    let token = Address::generate(&env);

    // Deadline in the past
    let result = client.try_create_campaign(&artist, &token, &5000, &500, &0);
    assert_eq!(result, Err(Ok(Error::InvalidDeadline)));

    // Deadline at current time
    let result = client.try_create_campaign(&artist, &token, &5000, &1000, &0);
    assert_eq!(result, Err(Ok(Error::InvalidDeadline)));
}

#[test]
fn test_campaign_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TipGoalCampaignContract);
    let client = TipGoalCampaignContractClient::new(&env, &contract_id);

    let fake_id = String::from_str(&env, "999");
    let result = client.try_get_campaign(&fake_id);
    assert_eq!(result, Err(Ok(Error::CampaignNotFound)));
}

#[test]
fn test_user_campaign_tracking() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign1 = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);
    let campaign2 = client.create_campaign(&artist, &token_addr, &3000, &2000, &0);

    client.contribute(&campaign1, &contributor, &100);
    client.contribute(&campaign2, &contributor, &200);

    let user_campaigns = client.get_user_campaigns(&contributor);
    assert_eq!(user_campaigns.len(), 2);
}

#[test]
fn test_invalid_contribution_amount() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    let result = client.try_contribute(&campaign_id, &contributor, &0);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn test_goal_exceeded() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &1000, &2000, &0);

    // Over-contribute
    client.contribute(&campaign_id, &contributor, &2000);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.current_amount, 2000);

    let result = client.finalize_campaign(&campaign_id);
    assert_eq!(result, CampaignResult::GoalMet);
}

#[test]
fn test_hard_cap_prevents_overfunding() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    // Create campaign with hard cap of 1500
    let campaign_id = client.create_campaign(&artist, &token_addr, &1000, &2000, &1500);

    // First contribution of 1000 ok
    client.contribute(&campaign_id, &contributor, &1000);
    // Second contribution that would exceed cap (500) -> cap total would be 1500 which is exactly cap? The condition is projected > cap, so if cap=1500, current=1000, adding 500 results 1500 <= cap, allowed. Adding 501 would exceed.
    client.contribute(&campaign_id, &contributor, &500);
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.current_amount, 1500);

    // Attempt to contribute 1 more should fail
    let result = client.try_contribute(&campaign_id, &contributor, &1);
    assert_eq!(result, Err(Ok(Error::HardCapExceeded)));
}

#[test]
fn test_refund_for_failed_campaign() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &1000);

    // Advance past deadline
    env.ledger().with_mut(|li| {
        li.timestamp = 2001;
    });

    // Finalize (will fail)
    let result = client.finalize_campaign(&campaign_id);
    assert_eq!(result, CampaignResult::GoalNotMet);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Failed);

    let initial_contributor_balance = token_client.balance(&contributor);
    let initial_contract_balance = token_client.balance(&env.contract_id());

    // Claim refund
    client.claim_refund(&campaign_id, &contributor);

    // Contributor gets tokens back
    assert_eq!(
        token_client.balance(&contributor),
        initial_contributor_balance + 1000
    );
    assert_eq!(
        token_client.balance(&env.contract_id()),
        initial_contract_balance - 1000
    );

    // Flag set
    assert!(client.has_contributor_claimed_refund(&campaign_id, &contributor));
}

#[test]
fn test_double_claim_refund_prevention() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &1000);

    // Advance and finalize to failed
    env.ledger().with_mut(|li| {
        li.timestamp = 2001;
    });
    client.finalize_campaign(&campaign_id);

    // First claim succeeds
    client.claim_refund(&campaign_id, &contributor);
    // Second claim fails
    let result = client.try_claim_refund(&campaign_id, &contributor);
    assert_eq!(result, Err(Ok(Error::RefundAlreadyClaimed)));
}

#[test]
fn test_cannot_refund_before_failure() {
    let (env, client, artist, contributor, token_client) = setup_test_with_token(10_000);

    let token_addr = token_client.address.clone();
    let campaign_id = client.create_campaign(&artist, &token_addr, &5000, &2000, &0);

    client.contribute(&campaign_id, &contributor, &1000);

    // Campaign still active, can't claim refund
    let result = client.try_claim_refund(&campaign_id, &contributor);
    assert_eq!(result, Err(Ok(Error::CampaignNotExpired)));
}
