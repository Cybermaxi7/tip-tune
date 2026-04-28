use soroban_sdk::{contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone)]
pub enum IndexKey {
    ArtistEntries(Address),
}

const LIFETIME_THRESHOLD: u32 = 100_000;
const EXTEND_TO: u32 = 200_000;

fn bump(env: &Env, key: &IndexKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, LIFETIME_THRESHOLD, EXTEND_TO);
}

pub fn add_to_index(env: &Env, artist: &Address, address: &Address) {
    let key = IndexKey::ArtistEntries(artist.clone());
    let mut entries: Vec<Address> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    entries.push_back(address.clone());
    env.storage().persistent().set(&key, &entries);
    bump(env, &key);
}

pub fn remove_from_index(env: &Env, artist: &Address, address: &Address) {
    let key = IndexKey::ArtistEntries(artist.clone());
    if let Some(mut entries) = env
        .storage()
        .persistent()
        .get::<IndexKey, Vec<Address>>(&key)
    {
        let len = entries.len();
        for i in 0..len {
            if entries.get(i).unwrap() == *address {
                let last = entries.pop_back().unwrap();
                if i < entries.len() {
                    entries.set(i, last);
                }
                break;
            }
        }
        env.storage().persistent().set(&key, &entries);
        bump(env, &key);
    }
}

pub fn get_page(env: &Env, artist: &Address, page: u32, page_size: u32) -> Vec<Address> {
    if page_size == 0 || page_size > 100 {
        return Vec::new(env);
    }
    let key = IndexKey::ArtistEntries(artist.clone());
    let entries: Vec<Address> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    if !entries.is_empty() {
        bump(env, &key);
    }
    let start = page * page_size;
    let total = entries.len();
    let end = (start + page_size).min(total);
    let mut result = Vec::new(env);
    for i in start..end {
        result.push_back(entries.get(i).unwrap());
    }
    result
}

pub fn get_count(env: &Env, artist: &Address) -> u32 {
    let key = IndexKey::ArtistEntries(artist.clone());
    let entries = env.storage()
        .persistent()
        .get::<IndexKey, Vec<Address>>(&key)
        .unwrap_or_else(|| Vec::new(env));
    if !entries.is_empty() {
        bump(env, &key);
    }
    entries.len()
}
