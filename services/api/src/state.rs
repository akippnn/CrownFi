use std::{collections::{HashMap, HashSet}, sync::{Arc, Mutex}};

use crate::{config::Config, models::{Category, Contestant, Event, Snapshot}};

pub type VoteKey = (String, String, String);
pub type TallyKey = (String, String);

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub events: Arc<HashMap<String, Event>>,
    pub categories: Arc<HashMap<String, Category>>,
    pub contestants: Arc<HashMap<String, Contestant>>,
    pub votes: Arc<Mutex<HashSet<VoteKey>>>,
    pub tally: Arc<Mutex<HashMap<TallyKey, HashMap<String, u64>>>>,
    pub snapshots: Arc<Mutex<HashMap<String, Snapshot>>>,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let event = Event {
            id: "coronation-night-2026".to_string(),
            name: "Coronation Night 2026".to_string(),
            slug: "coronation-night-2026".to_string(),
            status: "active".to_string(),
            venue: "CrownFi Grand Stage".to_string(),
            starts_at: "2026-08-30T12:00:00Z".to_string(),
        };

        let category = Category {
            id: "fan-choice".to_string(),
            event_id: event.id.clone(),
            name: "Fan Choice".to_string(),
            voting_status: "open".to_string(),
        };

        let contestants = [
            Contestant {
                id: "phl".to_string(),
                event_id: event.id.clone(),
                category_id: category.id.clone(),
                name: "Ariella Santos".to_string(),
                country: "Philippines".to_string(),
                sash: "PHL".to_string(),
            },
            Contestant {
                id: "jpn".to_string(),
                event_id: event.id.clone(),
                category_id: category.id.clone(),
                name: "Mika Tanaka".to_string(),
                country: "Japan".to_string(),
                sash: "JPN".to_string(),
            },
            Contestant {
                id: "tha".to_string(),
                event_id: event.id.clone(),
                category_id: category.id.clone(),
                name: "Anong Chai".to_string(),
                country: "Thailand".to_string(),
                sash: "THA".to_string(),
            },
        ];

        Self {
            config,
            events: Arc::new(HashMap::from([(event.id.clone(), event)])),
            categories: Arc::new(HashMap::from([(category.id.clone(), category)])),
            contestants: Arc::new(
                contestants
                    .into_iter()
                    .map(|contestant| (contestant.id.clone(), contestant))
                    .collect(),
            ),
            votes: Arc::new(Mutex::new(HashSet::new())),
            tally: Arc::new(Mutex::new(HashMap::new())),
            snapshots: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
