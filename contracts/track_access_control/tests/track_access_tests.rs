#![cfg(test)]
use soroban_sdk::{testutils::Address as _, Address, Env, String};
use track_access_control::{Error, TrackAccessControl, TrackAccessControlClient};

#[test]
fn test_track_gate_and_unlock() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let listener = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);
    let track_id = String::from_str(&env, "track1");

    client.set_track_access(&artist, &track_id, &50);

    let result = client.try_unlock_track(&listener, &track_id, &30);
    assert_eq!(result, Err(Ok(Error::TipTooLow)));

    assert!(client.unlock_track(&listener, &track_id, &50));

    assert!(client.check_access(&listener, &track_id));

    client.remove_gate(&artist, &track_id);
    let another_listener = Address::generate(&env);
    assert!(client.check_access(&another_listener, &track_id));
}

#[test]
fn test_only_track_owner_can_update_gate() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let other_artist = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);
    let track_id = String::from_str(&env, "track2");

    client.set_track_access(&artist, &track_id, &100);

    let result = client.try_set_track_access(&other_artist, &track_id, &200);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_unlock_with_proof_success() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let listener = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_proof");
    let proof_id = String::from_str(&env, "tip_tx_abc123");

    client.set_track_access(&artist, &track_id, &100);

    // Proof-based unlock should succeed with a valid tip amount and unused proof.
    let result = client.unlock_with_proof(&listener, &track_id, &100, &proof_id);
    assert!(result);

    // Listener should now have access.
    assert!(client.check_access(&listener, &track_id));
}

#[test]
fn test_duplicate_proof_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let listener1 = Address::generate(&env);
    let listener2 = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_dup");
    let proof_id = String::from_str(&env, "tip_tx_used");

    client.set_track_access(&artist, &track_id, &50);

    // First use of proof succeeds.
    assert!(client.unlock_with_proof(&listener1, &track_id, &50, &proof_id));

    // Same proof_id must be rejected even for a different listener.
    let result = client.try_unlock_with_proof(&listener2, &track_id, &50, &proof_id);
    assert_eq!(result, Err(Ok(Error::ProofAlreadyUsed)));
}

#[test]
fn test_proof_unlock_tip_too_low() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let listener = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_low");
    let proof_id = String::from_str(&env, "tip_tx_low");

    client.set_track_access(&artist, &track_id, &200);

    let result = client.try_unlock_with_proof(&listener, &track_id, &100, &proof_id);
    assert_eq!(result, Err(Ok(Error::TipTooLow)));
}

#[test]
fn test_duplicate_grant_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let artist = Address::generate(&env);
    let listener = Address::generate(&env);
    let contract_id = env.register_contract(None, TrackAccessControl);
    let client = TrackAccessControlClient::new(&env, &contract_id);

    let track_id = String::from_str(&env, "track_dup_grant");
    let proof1 = String::from_str(&env, "tip_tx_first");
    let proof2 = String::from_str(&env, "tip_tx_second");

    client.set_track_access(&artist, &track_id, &50);

    // First unlock succeeds.
    assert!(client.unlock_with_proof(&listener, &track_id, &50, &proof1));

    // Same listener with a different proof — already has access.
    let result = client.try_unlock_with_proof(&listener, &track_id, &50, &proof2);
    assert_eq!(result, Err(Ok(Error::AlreadyUnlocked)));
}
