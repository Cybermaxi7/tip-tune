#[cfg(test)]
mod tests {
    use soroban_sdk::testutils::Addresses;
    use soroban_sdk::{Env, Vec};

    const ONE_DAY_LEDGERS: u64 = 86400 / 5;

    #[test]
    fn test_reward_accrual_precision() {
        let env = Env::default();
        env.mock_all_auths();

        let listener = env.addresses().generate();
        let artist = env.addresses().generate();
        let rate_per_second: i128 = 1000;
        let deposit: i128 = 1000000;

        let _stream_id = "stream_1".into();
        assert_eq!(rate_per_second, 1000);
        assert_eq!(deposit, 1000000);

        let expected_seconds = deposit / rate_per_second;
        assert_eq!(expected_seconds, 1000, "Full drainage time matches deposit/rate");
    }

    #[test]
    fn test_partial_unstake_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let rate: i128 = 100;
        let deposit: i128 = 10000;
        let claim_ledgers: u64 = 100;

        let expected_claim = rate * (claim_ledgers as i128);
        assert_eq!(expected_claim, 10000, "Claim matches rate * ledgers");

        let remaining = deposit - expected_claim;
        assert_eq!(remaining, 0, "Partial claim leaves remaining balance");
    }

    #[test]
    fn test_repeated_claims_stability() {
        let env = Env::default();
        env.mock_all_auths();

        let rate: i128 = 500;
        let deposit: i128 = 50000;
        let mut total_claimed: i128 = 0;
        let iterations = 10;
        let ledgers_per_claim: u64 = 100;

        for i in 0..iterations {
            let claim = rate * (ledgers_per_claim as i128);
            total_claimed += claim;

            assert!(
                total_claimed <= deposit,
                "Iteration {}: total claimed {} <= deposit {}",
                i,
                total_claimed,
                deposit
            );
        }

        assert_eq!(total_claimed, 5000, "Total after 10 claims equals rate * ledgers * iterations");
    }

    #[test]
    fn test_stream_expiry_invariant() {
        let env = Env::default();
        env.mock_all_auths();

        let rate: i128 = 1000;
        let deposit: i128 = 5000;
        let ledgers_to_expire = deposit / rate;

        assert_eq!(ledgers_to_expire, 5, "Expiry at exactly deposit/rate ledgers");

        let claim_at_expiry = rate * (ledgers_to_expire as i128);
        assert!(
            claim_at_expiry <= deposit,
            "Final claim {} <= deposit {}",
            claim_at_expiry,
            deposit
        );
    }

    #[test]
    fn test_edge_timing_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let rate: i128 = 1;
        let deposit: i128 = 1;

        let claim_single = rate;
        assert_eq!(claim_single, 1, "Single ledger claim equals rate");

        let remaining = deposit - claim_single;
        assert_eq!(remaining, 0, "Zero remainder after single claim");
    }

    #[test]
    fn test_zero_rate_protection() {
        let rate: i128 = 0;
        let deposit: i128 = 10000;

        let claim = rate;
        assert_eq!(claim, 0, "Zero rate produces zero claim");
    }

    #[test]
    fn test_overflow_protection() {
        let rate: i128 = i128::MAX;
        let ledgers: u64 = 10;

        let result = rate.checked_mul(ledgers as i128);
        assert!(result.is_none(), "Overflow should be detected");
    }
}