#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

#[test]
fn test_set_and_distribute() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track1");
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let mut collaborators = Vec::new(&env);
    collaborators.push_back((user1.clone(), 6000));
    collaborators.push_back((user2.clone(), 4000));

    // Set split
    client.set_royalty_split(&track_id, &collaborators);

    // Distribute
    let amount = 1000;
    let distributions = client.distribute_royalties(&track_id, &amount);

    assert_eq!(distributions.len(), 2);
    assert_eq!(distributions.get(0).unwrap(), (user1.clone(), 600));
    assert_eq!(distributions.get(1).unwrap(), (user2.clone(), 400));
}

#[test]
fn test_rounding_behavior() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_round");
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let mut collaborators = Vec::new(&env);
    // 33.33%, 33.33%, 33.34%
    collaborators.push_back((user1.clone(), 3333));
    collaborators.push_back((user2.clone(), 3333));
    collaborators.push_back((user3.clone(), 3334));

    client.set_royalty_split(&track_id, &collaborators);

    // Distribute 100 units
    let amount = 100;
    let distributions = client.distribute_royalties(&track_id, &amount);

    // 100 * 3333 / 10000 = 33.33 -> 33
    // 100 * 3333 / 10000 = 33.33 -> 33
    // Remainder: 100 - 33 - 33 = 34
    assert_eq!(distributions.get(0).unwrap().1, 33);
    assert_eq!(distributions.get(1).unwrap().1, 33);
    assert_eq!(distributions.get(2).unwrap().1, 34);
}

#[test]
fn test_total_not_10000() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track2");
    let user1 = Address::generate(&env);

    let mut collaborators = Vec::new(&env);
    collaborators.push_back((user1.clone(), 9000));

    // Set split should fail with TotalNot10000
    let res = client.try_set_royalty_split(&track_id, &collaborators);
    assert_eq!(res, Err(Ok(Error::TotalNot10000)));
}

#[test]
fn test_track_not_found() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track3");

    let res = client.try_distribute_royalties(&track_id, &1000);
    assert_eq!(res, Err(Ok(Error::TrackNotFound)));
}

#[test]
fn test_update_collaborator() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_update");
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let mut collaborators = Vec::new(&env);
    collaborators.push_back((user1.clone(), 6000));
    collaborators.push_back((user2.clone(), 4000));
    client.set_royalty_split(&track_id, &collaborators);

    // Update user1 from 60% to 70%; user2 should drop to 30%
    client.update_collaborator(&track_id, &user1, &7000);

    let distributions = client.distribute_royalties(&track_id, &1000);
    assert_eq!(distributions.get(0).unwrap(), (user1.clone(), 700));
    assert_eq!(distributions.get(1).unwrap(), (user2.clone(), 300));
}

#[test]
fn test_remove_collaborator() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_remove");
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let mut collaborators = Vec::new(&env);
    collaborators.push_back((user1.clone(), 5000));
    collaborators.push_back((user2.clone(), 3000));
    collaborators.push_back((user3.clone(), 2000));
    client.set_royalty_split(&track_id, &collaborators);

    // Remove user2 (3000 bp); user3 should absorb their share (2000 + 3000 = 5000)
    client.remove_collaborator(&track_id, &user2);

    let distributions = client.distribute_royalties(&track_id, &1000);
    assert_eq!(distributions.len(), 2);
    assert_eq!(distributions.get(0).unwrap(), (user1.clone(), 500));
    assert_eq!(distributions.get(1).unwrap(), (user3.clone(), 500));
}

#[test]
fn test_cannot_remove_only_collaborator() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_solo");
    let user1 = Address::generate(&env);

    let mut collaborators = Vec::new(&env);
    collaborators.push_back((user1.clone(), 10000));
    client.set_royalty_split(&track_id, &collaborators);

    let res = client.try_remove_collaborator(&track_id, &user1);
    assert_eq!(res, Err(Ok(Error::CannotRemoveOnlyCollaborator)));
}

#[test]
fn test_collaborator_not_found() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RoyaltySplit);
    let client = RoyaltySplitClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_notfound");
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let stranger = Address::generate(&env);

    let mut collaborators = Vec::new(&env);
    collaborators.push_back((user1.clone(), 6000));
    collaborators.push_back((user2.clone(), 4000));
    client.set_royalty_split(&track_id, &collaborators);

    let res = client.try_remove_collaborator(&track_id, &stranger);
    assert_eq!(res, Err(Ok(Error::CollaboratorNotFound)));
}
