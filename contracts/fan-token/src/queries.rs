use soroban_sdk::{Address, Env, Vec};

use crate::{storage, FanBalance};

pub fn list_holders(env: &Env, artist: &Address, page: u32, page_size: u32) -> Vec<Address> {
    let holders = storage::get_holders(env, artist);
    if page_size == 0 || page_size > 100 {
        return Vec::new(env);
    }

    let start = page.saturating_mul(page_size);
    let end = (start + page_size).min(holders.len());
    let mut result = Vec::new(env);

    for i in start..end {
        result.push_back(holders.get(i).unwrap());
    }
    result
}

pub fn top_fans(env: &Env, artist: &Address, limit: u32) -> Vec<FanBalance> {
    if limit == 0 {
        return Vec::new(env);
    }

    let holders = storage::get_holders(env, artist);
    let mut ranked = Vec::new(env);

    for holder in holders.iter() {
        if let Some(balance) = storage::get_balance(env, artist, &holder) {
            if balance.balance > 0 {
                ranked.push_back(balance);
            }
        }
    }

    let len = ranked.len();
    for i in 0..len {
        let mut max_idx = i;
        for j in (i + 1)..len {
            let left = ranked.get(max_idx).unwrap();
            let right = ranked.get(j).unwrap();
            if right.balance > left.balance {
                max_idx = j;
            }
        }
        if max_idx != i {
            let vi = ranked.get(i).unwrap();
            let vmax = ranked.get(max_idx).unwrap();
            ranked.set(i, vmax);
            ranked.set(max_idx, vi);
        }
    }

    let take = limit.min(ranked.len());
    let mut top = Vec::new(env);
    for i in 0..take {
        top.push_back(ranked.get(i).unwrap());
    }
    top
}
