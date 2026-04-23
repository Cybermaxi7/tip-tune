#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String, Vec,
};

mod events;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidPercentage = 1,
    TotalNot10000 = 2,
    TrackNotFound = 3,
    CollaboratorNotFound = 4,
    AlreadyExists = 5,
    CannotRemoveOnlyCollaborator = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Split(String),
}

#[contract]
pub struct RoyaltySplit;

#[contractimpl]
impl RoyaltySplit {
    /// Set the whole royalty split for a track. Total must be 10,000 basis points.
    pub fn set_royalty_split(
        env: Env,
        track_id: String,
        collaborators: Vec<(Address, u32)>,
    ) -> Result<(), Error> {
        let mut total_bp: u32 = 0;
        for param in collaborators.clone() {
            let (_, bp) = param;
            if bp == 0 || bp > 10000 {
                return Err(Error::InvalidPercentage);
            }
            total_bp += bp;
        }

        if total_bp != 10000 {
            return Err(Error::TotalNot10000);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Split(track_id.clone()), &collaborators);

        events::emit_split_set(&env, track_id);

        Ok(())
    }

    /// Update a single collaborator's basis points.
    /// The last collaborator in the list absorbs the difference to keep the total at 10,000.
    /// Returns an error if the collaborator is not found or if the adjustment is impossible.
    pub fn update_collaborator(
        env: Env,
        track_id: String,
        collaborator: Address,
        new_bp: u32,
    ) -> Result<(), Error> {
        if new_bp == 0 || new_bp >= 10000 {
            return Err(Error::InvalidPercentage);
        }

        let collabs: Vec<(Address, u32)> = env
            .storage()
            .persistent()
            .get(&DataKey::Split(track_id.clone()))
            .ok_or(Error::TrackNotFound)?;

        if collabs.len() < 2 {
            return Err(Error::CannotRemoveOnlyCollaborator);
        }

        let last_idx = collabs.len() - 1;

        // Find the target collaborator (must not be the last one)
        let mut found_idx: Option<u32> = None;
        let mut old_bp: u32 = 0;
        for i in 0..collabs.len() {
            let (addr, bp) = collabs.get(i).unwrap();
            if addr == collaborator {
                if i == last_idx {
                    // Updating the last collaborator directly is not allowed;
                    // it would break the remainder invariant.
                    return Err(Error::InvalidPercentage);
                }
                found_idx = Some(i);
                old_bp = bp;
                break;
            }
        }

        let idx = found_idx.ok_or(Error::CollaboratorNotFound)?;

        // Calculate the adjusted share for the last collaborator.
        let (last_addr, last_bp) = collabs.get(last_idx).unwrap();
        let adjusted_last_bp = if new_bp > old_bp {
            let diff = new_bp - old_bp;
            if last_bp < diff {
                return Err(Error::InvalidPercentage);
            }
            last_bp - diff
        } else {
            let diff = old_bp - new_bp;
            last_bp.checked_add(diff).ok_or(Error::InvalidPercentage)?
        };

        if adjusted_last_bp == 0 {
            return Err(Error::InvalidPercentage);
        }

        // Rebuild the collaborator list with the updated values.
        let mut updated: Vec<(Address, u32)> = Vec::new(&env);
        for i in 0..collabs.len() {
            let (addr, bp) = collabs.get(i).unwrap();
            if i == idx {
                updated.push_back((addr, new_bp));
            } else if i == last_idx {
                updated.push_back((addr, adjusted_last_bp));
            } else {
                updated.push_back((addr, bp));
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::Split(track_id.clone()), &updated);

        events::emit_collaborator_updated(&env, track_id, &collaborator, new_bp);

        Ok(())
    }

    /// Remove a collaborator from the split.
    /// Their basis points are redistributed to the last remaining collaborator.
    /// Requires at least two collaborators so the total stays at 10,000.
    pub fn remove_collaborator(
        env: Env,
        track_id: String,
        collaborator: Address,
    ) -> Result<(), Error> {
        let collabs: Vec<(Address, u32)> = env
            .storage()
            .persistent()
            .get(&DataKey::Split(track_id.clone()))
            .ok_or(Error::TrackNotFound)?;

        if collabs.len() < 2 {
            return Err(Error::CannotRemoveOnlyCollaborator);
        }

        // Find the collaborator to remove.
        let mut found_idx: Option<u32> = None;
        let mut removed_bp: u32 = 0;
        for i in 0..collabs.len() {
            let (addr, bp) = collabs.get(i).unwrap();
            if addr == collaborator {
                found_idx = Some(i);
                removed_bp = bp;
                break;
            }
        }

        let idx = found_idx.ok_or(Error::CollaboratorNotFound)?;

        // Rebuild without the removed collaborator; give their share to the last entry.
        let new_len = collabs.len() - 1;
        let last_before_removal = collabs.len() - 1;

        let mut updated: Vec<(Address, u32)> = Vec::new(&env);
        for i in 0..collabs.len() {
            if i == idx {
                continue;
            }
            let (addr, bp) = collabs.get(i).unwrap();
            // The last entry in the new list absorbs the removed share.
            let effective_bp = if i == last_before_removal || updated.len() == new_len - 1 {
                bp + removed_bp
            } else {
                bp
            };
            updated.push_back((addr, effective_bp));
        }

        env.storage()
            .persistent()
            .set(&DataKey::Split(track_id.clone()), &updated);

        events::emit_collaborator_removed(&env, track_id, &collaborator);

        Ok(())
    }

    pub fn distribute_royalties(
        env: Env,
        track_id: String,
        amount: i128,
    ) -> Result<Vec<(Address, i128)>, Error> {
        if amount <= 0 {
            return Ok(Vec::new(&env));
        }

        let split: Vec<(Address, u32)> = env
            .storage()
            .persistent()
            .get(&DataKey::Split(track_id))
            .ok_or(Error::TrackNotFound)?;

        let mut distributions = Vec::new(&env);
        let mut total_distributed = 0;
        let collaborators_count = split.len();

        for i in 0..collaborators_count {
            let (collab, bp) = split.get(i).unwrap();

            let share = if i == (collaborators_count - 1) {
                // Last collaborator gets the remainder to handle rounding errors
                amount - total_distributed
            } else {
                (amount * (bp as i128)) / 10000
            };

            total_distributed += share;
            distributions.push_back((collab, share));
        }

        Ok(distributions)
    }
}

mod test;
