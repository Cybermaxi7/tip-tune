use soroban_sdk::{contracttype, Address, String};

/// Metadata recorded when a proof-based unlock is executed.
#[contracttype]
#[derive(Clone)]
pub struct ProofRecord {
    pub proof_id: String,
    pub listener: Address,
    pub track_id: String,
    pub used_at: u64,
}
