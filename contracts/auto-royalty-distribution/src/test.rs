#![cfg(test)]

use super::*;
extern crate std;
use std::format;
use soroban_sdk::{testutils::{Address as _, Ledger, LedgerInfo}, Address, Env, String, Vec};
use crate::storage::MAX_LOGS_PER_TRACK;

#[test]
fn test_set_splits() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_001");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);
    let collab2 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 6000, // 60%
    });
    collabs.push_back(Collaborator {
        address: collab2.clone(),
        percentage: 4000, // 40%
    });

    client.set_splits(&owner, &track_id, &collabs);

    let retrieved = client.get_splits(&track_id);
    assert_eq!(retrieved.len(), 2);
    assert_eq!(retrieved.get(0).unwrap().percentage, 6000);
    assert_eq!(retrieved.get(1).unwrap().percentage, 4000);
}

#[test]
fn test_receive_and_distribute() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_dist");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);
    let collab2 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 7000, // 70%
    });
    collabs.push_back(Collaborator {
        address: collab2.clone(),
        percentage: 3000, // 30%
    });

    client.set_splits(&owner, &track_id, &collabs);
    let payout_id = String::from_str(&env, "payout_001");

    let result = client.receive_and_distribute(&track_id, &payout_id, &1000, &Asset::Native);

    assert_eq!(result.len(), 2);
    assert_eq!(result.get(0).unwrap(), (collab1.clone(), 700));
    assert_eq!(result.get(1).unwrap(), (collab2.clone(), 300));
}

#[test]
fn test_rounding_no_loss() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_round");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);
    let collab2 = Address::generate(&env);
    let collab3 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 3333, // 33.33%
    });
    collabs.push_back(Collaborator {
        address: collab2.clone(),
        percentage: 3333, // 33.33%
    });
    collabs.push_back(Collaborator {
        address: collab3.clone(),
        percentage: 3334, // 33.34%
    });

    client.set_splits(&owner, &track_id, &collabs);
    let payout_id = String::from_str(&env, "payout_round");

    let result = client.receive_and_distribute(
        &track_id,
        &payout_id,
        &100, // Small amount to trigger rounding
        &Asset::Native,
    );

    // Verify no funds are lost: sum of distributions must equal original amount
    let mut total: i128 = 0;
    for dist in result.iter() {
        let (_, amount) = dist;
        total += amount;
    }
    assert_eq!(total, 100);
}

#[test]
fn test_multiple_assets() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_multi_asset");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 10000, // 100%
    });

    client.set_splits(&owner, &track_id, &collabs);

    // Test with Native asset
    let native_payout = String::from_str(&env, "payout_native");
    let result_native =
        client.receive_and_distribute(&track_id, &native_payout, &500, &Asset::Native);
    assert_eq!(result_native.get(0).unwrap(), (collab1.clone(), 500));

    // Test with Token asset
    let token_addr = Address::generate(&env);
    let token_payout = String::from_str(&env, "payout_token");
    let result_token =
        client.receive_and_distribute(&track_id, &token_payout, &750, &Asset::Token(token_addr));
    assert_eq!(result_token.get(0).unwrap(), (collab1.clone(), 750));
}

#[test]
fn test_batch_distribute() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track1 = String::from_str(&env, "track_batch1");
    let track2 = String::from_str(&env, "track_batch2");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 10000,
    });

    client.set_splits(&owner, &track1, &collabs);
    client.set_splits(&owner, &track2, &collabs);

    let mut batch = Vec::new(&env);
    batch.push_back((
        track1.clone(),
        String::from_str(&env, "batch_1"),
        1000_i128,
        Asset::Native,
    ));
    batch.push_back((
        track2.clone(),
        String::from_str(&env, "batch_2"),
        2000_i128,
        Asset::Native,
    ));

    let results = client.batch_distribute(&batch);

    assert_eq!(results.len(), 2);
    assert!(results.get(0).unwrap());
    assert!(results.get(1).unwrap());
    assert_eq!(client.get_settlement_count(&track1), 1);
    assert_eq!(client.get_settlement_count(&track2), 1);
}

#[test]
fn test_invalid_percentage() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_invalid");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 0, // Invalid: 0%
    });

    let result = client.try_set_splits(&owner, &track_id, &collabs);
    assert_eq!(result, Err(Ok(Error::InvalidPercentage)));
}

#[test]
fn test_total_exceeds_100() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_over100");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);
    let collab2 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 6000,
    });
    collabs.push_back(Collaborator {
        address: collab2.clone(),
        percentage: 5000,
    });

    let result = client.try_set_splits(&owner, &track_id, &collabs);
    assert_eq!(result, Err(Ok(Error::TotalExceeds10000)));
}

#[test]
fn test_track_not_found() {
    let env = Env::default();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "nonexistent");
    let payout_id = String::from_str(&env, "missing_track");
    let result = client.try_receive_and_distribute(&track_id, &payout_id, &1000, &Asset::Native);
    assert_eq!(result, Err(Ok(Error::TrackNotFound)));
}

#[test]
fn test_invalid_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_inv_amt");
    let owner = Address::generate(&env);
    let collab1 = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab1.clone(),
        percentage: 10000,
    });

    client.set_splits(&owner, &track_id, &collabs);
    let zero_payout = String::from_str(&env, "zero_payout");
    let negative_payout = String::from_str(&env, "negative_payout");

    let result = client.try_receive_and_distribute(&track_id, &zero_payout, &0, &Asset::Native);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));

    let result =
        client.try_receive_and_distribute(&track_id, &negative_payout, &-100, &Asset::Native);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn test_no_collaborators() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_empty");
    let owner = Address::generate(&env);
    let collabs: Vec<Collaborator> = Vec::new(&env);

    let result = client.try_set_splits(&owner, &track_id, &collabs);
    assert_eq!(result, Err(Ok(Error::NoCollaborators)));
}

#[test]
fn test_unauthorized_owner_update() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_auth");
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let collab = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab.clone(),
        percentage: 10000,
    });

    // Owner sets splits first
    client.set_splits(&owner, &track_id, &collabs);

    // Attacker tries to update — must fail with Unauthorized
    let result = client.try_set_splits(&attacker, &track_id, &collabs);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_log_retention() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "retention_track");
    let owner = Address::generate(&env);
    let collab = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab.clone(),
        percentage: 10000,
    });
    client.set_splits(&owner, &track_id, &collabs);

    // Add more than MAX_LOGS_PER_TRACK logs
    let total_to_add = MAX_LOGS_PER_TRACK + 10;
    for i in 0..total_to_add {
        let payout_id = String::from_str(&env, &format!("payout_{}", i));
        client.receive_and_distribute(&track_id, &payout_id, &100, &Asset::Native);
    }

    // Settlement count should reflect total ever added
    assert_eq!(client.get_settlement_count(&track_id), total_to_add);

    // Old logs should be gone
    assert!(client.get_settlement_history(&track_id, &0).is_none());
    assert!(client.get_settlement_history(&track_id, &9).is_none());
    
    // Recent logs should be present
    assert!(client.get_settlement_history(&track_id, &10).is_some());
    assert!(client.get_settlement_history(&track_id, &(total_to_add - 1)).is_some());

    // Paginated results should respect available logs
    let recent = client.get_recent_settlements_paginated(&track_id, &0, &100);
    assert_eq!(recent.len(), MAX_LOGS_PER_TRACK);
}

#[test]
fn test_ttl_bumping() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "ttl_track");
    let owner = Address::generate(&env);
    let collab = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab.clone(),
        percentage: 10000,
    });

    // Set splits - this should set initial TTL
    client.set_splits(&owner, &track_id, &collabs);

    // Jump ahead in time, but stay within TTL
    env.ledger().set(LedgerInfo {
        number: 100,
        timestamp: 1000,
        network_id: [0; 32],
        base_reserve: 100,
        min_persistent_entry_ttl: 10,
        min_temp_entry_ttl: 10,
        max_entry_ttl: 100_000,
    });

    // Calling get_splits should bump TTL
    let _ = client.get_splits(&track_id);
    
    // Note: In unit tests, we can't easily assert the exact TTL value of a key 
    // without deeper testutils access, but we can verify it doesn't crash 
    // and the logic is exercised.
}

#[test]
fn test_pagination_rotation() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, AutoRoyaltyDistribution);
    let client = AutoRoyaltyDistributionClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "rotate_pagination");
    let owner = Address::generate(&env);
    let collab = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Collaborator {
        address: collab.clone(),
        percentage: 10000,
    });
    client.set_splits(&owner, &track_id, &collabs);

    // Fill up and wrap around
    for i in 0..(MAX_LOGS_PER_TRACK + 20) {
        let payout_id = String::from_str(&env, &format!("p_{}", i));
        client.receive_and_distribute(&track_id, &payout_id, &100, &Asset::Native);
    }

    // total_count = MAX + 20 = 70 (if MAX=50)
    // Available logs: [20, 69]
    
    // Page 0, size 10: [69, 68, ..., 60]
    let page0 = client.get_recent_settlements_paginated(&track_id, &0, &10);
    assert_eq!(page0.len(), 10);
    assert_eq!(page0.get(0).unwrap().payout_id, String::from_str(&env, "p_69"));

    // Page 4, size 10: [29, 28, ..., 20]
    let page4 = client.get_recent_settlements_paginated(&track_id, &4, &10);
    assert_eq!(page4.len(), 10);
    assert_eq!(page4.get(0).unwrap().payout_id, String::from_str(&env, "p_29"));
    assert_eq!(page4.get(9).unwrap().payout_id, String::from_str(&env, "p_20"));

    // Page 5, size 10: empty or truncated since only 50 logs are kept
    let page5 = client.get_recent_settlements_paginated(&track_id, &5, &10);
    assert_eq!(page5.len(), 0);
}
