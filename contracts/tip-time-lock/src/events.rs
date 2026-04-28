use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Symbol};

use crate::types::TimeLockTip;

pub const TOPIC_GROUP: Symbol = symbol_short!("TIP");
pub const TOPIC_CREATE: Symbol = symbol_short!("CREATE");
pub const TOPIC_CLAIM: Symbol = symbol_short!("CLAIM");
pub const TOPIC_REFUND: Symbol = symbol_short!("REFUND");

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TipActionEvent {
    pub action: String,
    pub tip_id: String,
    pub tipper: Address,
    pub artist: Address,
    pub amount: i128,
    pub required_sigs: Option<u32>,
    pub approvals: Option<u32>,
    pub operator: Address,
    pub status: String,
    pub expires_at: Option<u64>,
    pub timestamp: u64,
}

impl TipActionEvent {
    fn from_tip(
        env: &Env,
        action: &str,
        status: &str,
        tip: &TimeLockTip,
        operator: &Address,
    ) -> TipActionEvent {
        TipActionEvent {
            action: String::from_str(env, action),
            tip_id: tip.lock_id.clone(),
            tipper: tip.tipper.clone(),
            artist: tip.artist.clone(),
            amount: tip.amount,
            required_sigs: None,
            approvals: None,
            operator: operator.clone(),
            status: String::from_str(env, status),
            expires_at: Some(tip.unlock_time),
            timestamp: env.ledger().timestamp(),
        }
    }
}

pub fn emit_tip_created(env: &Env, tip: &TimeLockTip) {
    env.events().publish(
        (TOPIC_GROUP, TOPIC_CREATE),
        TipActionEvent::from_tip(env, "CREATE", "LOCKED", tip, &tip.tipper),
    );
}

pub fn emit_tip_claimed(env: &Env, tip: &TimeLockTip, operator: &Address) {
    env.events().publish(
        (TOPIC_GROUP, TOPIC_CLAIM),
        TipActionEvent::from_tip(env, "CLAIM", "CLAIMED", tip, operator),
    );
}

pub fn emit_tip_refunded(env: &Env, tip: &TimeLockTip, operator: &Address) {
    env.events().publish(
        (TOPIC_GROUP, TOPIC_REFUND),
        TipActionEvent::from_tip(env, "REFUND", "REFUNDED", tip, operator),
    );
}
