use soroban_sdk::{contracttype, Address, Env, String, Vec};

#[contracttype]
#[derive(Clone)]
pub enum QueryKey {
    SponsorPools(Address),
    ArtistPools(Address),
}

pub fn add_to_sponsor_index(env: &Env, sponsor: &Address, pool_id: &String) {
    let key = QueryKey::SponsorPools(sponsor.clone());
    let mut ids: Vec<String> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    ids.push_back(pool_id.clone());
    env.storage().persistent().set(&key, &ids);
}

pub fn add_to_artist_index(env: &Env, artist: &Address, pool_id: &String) {
    let key = QueryKey::ArtistPools(artist.clone());
    let mut ids: Vec<String> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    ids.push_back(pool_id.clone());
    env.storage().persistent().set(&key, &ids);
}

pub fn get_pools_by_sponsor(env: &Env, sponsor: &Address) -> Vec<String> {
    env.storage()
        .persistent()
        .get(&QueryKey::SponsorPools(sponsor.clone()))
        .unwrap_or_else(|| Vec::new(env))
}

pub fn get_pools_by_artist(env: &Env, artist: &Address) -> Vec<String> {
    env.storage()
        .persistent()
        .get(&QueryKey::ArtistPools(artist.clone()))
        .unwrap_or_else(|| Vec::new(env))
}
