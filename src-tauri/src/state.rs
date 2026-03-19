use crate::models::{Config, HistoryFile, HydratePayload, ServiceEntry};
use crate::persistence::{prune_history, Store};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub inner: Arc<Mutex<InnerState>>,
}

#[derive(Debug, Default)]
pub struct InnerState {
    pub config: Config,
    pub history: HistoryFile,
    pub active: Vec<ServiceEntry>,
}

impl AppState {
    pub fn new(store: Store) -> Result<Self, String> {
        let store = Arc::new(store);
        let config = store.load_config();
        let mut history = store.load_history();
        prune_history(&mut history);
        store.save_history(&history)?;

        Ok(Self {
            store,
            inner: Arc::new(Mutex::new(InnerState {
                config,
                history,
                active: Vec::new(),
            })),
        })
    }

    pub fn hydrate_payload(&self) -> HydratePayload {
        let inner = self.inner.lock().expect("app state poisoned");
        HydratePayload {
            active: inner.active.clone(),
            history: inner.history.stopped.clone(),
            config: inner.config.clone(),
        }
    }
}
