use crate::models::{make_favorite_id, Config, HistoryFile, PinnedConfig, StoppedEntry};
use chrono::{DateTime, Duration, Utc};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Store {
    config_path: PathBuf,
    history_path: PathBuf,
}

impl Store {
    pub fn new(data_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(data_dir).map_err(|err| err.to_string())?;
        Ok(Self {
            config_path: data_dir.join("config.json"),
            history_path: data_dir.join("history.json"),
        })
    }

    pub fn load_config(&self) -> Config {
        let mut config: Config = fs::read_to_string(&self.config_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();
        config.pinned = migrate_pinned_keys(config.pinned);
        migrate_custom_names(&mut config);
        config
    }

    pub fn save_config(&self, config: &Config) -> Result<(), String> {
        atomic_write(&self.config_path, config)
    }

    pub fn load_history(&self) -> HistoryFile {
        let mut history = fs::read_to_string(&self.history_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();
        prune_history(&mut history);
        history
    }

    pub fn save_history(&self, history: &HistoryFile) -> Result<(), String> {
        atomic_write(&self.history_path, history)
    }
}

fn migrate_pinned_keys(
    pinned: std::collections::HashMap<String, PinnedConfig>,
) -> std::collections::HashMap<String, PinnedConfig> {
    let mut migrated = std::collections::HashMap::new();

    for (key, value) in pinned {
        let next_key = legacy_service_id_to_favorite_id(&key).unwrap_or(key);
        migrated
            .entry(next_key)
            .and_modify(|existing: &mut PinnedConfig| {
                if existing.restart_cmd.is_none() {
                    existing.restart_cmd = value.restart_cmd.clone();
                }
                if existing.custom_name.is_none() {
                    existing.custom_name = value.custom_name.clone();
                }
                if existing.display_name.is_none() {
                    existing.display_name = value.display_name.clone();
                }
                if existing.process_name.is_none() {
                    existing.process_name = value.process_name.clone();
                }
                if existing.cwd.is_none() {
                    existing.cwd = value.cwd.clone();
                }
                if existing.primary_port.is_none() {
                    existing.primary_port = value.primary_port;
                }
            })
            .or_insert(value);
    }

    migrated
}

fn legacy_service_id_to_favorite_id(service_id: &str) -> Option<String> {
    let (process_name, rest) = service_id.split_once(':')?;
    let (_, cwd) = rest.split_once(':')?;
    Some(make_favorite_id(
        process_name,
        (cwd != "unknown").then_some(cwd),
    ))
}

fn migrate_custom_names(config: &mut Config) {
    for (favorite_id, pinned) in config.pinned.iter_mut() {
        if let Some(custom_name) = pinned.custom_name.take() {
            config
                .custom_names
                .entry(favorite_id.clone())
                .or_insert(custom_name);
        }
    }
}

#[allow(dead_code)]
pub fn add_stopped_entry(
    store: &Store,
    entry: StoppedEntry,
    history: &mut HistoryFile,
) -> Result<(), String> {
    history.stopped.push(entry);
    prune_history(history);
    store.save_history(history)
}

pub fn next_history_id(history: &mut HistoryFile) -> String {
    let id = history.next_id.to_string();
    history.next_id += 1;
    id
}

fn atomic_write<T: serde::Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|err| err.to_string())?;
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, json).map_err(|err| err.to_string())?;
    fs::rename(&tmp_path, path).map_err(|err| err.to_string())?;
    Ok(())
}

pub fn prune_history(history: &mut HistoryFile) {
    let cutoff = Utc::now() - Duration::days(7);
    history.stopped.retain(|entry| {
        DateTime::parse_from_rfc3339(&entry.stopped_at)
            .map(|timestamp| timestamp.with_timezone(&Utc) >= cutoff)
            .unwrap_or(false)
    });

    if history.stopped.len() > 50 {
        let excess = history.stopped.len() - 50;
        history.stopped.drain(0..excess);
    }

    if history.next_id == 0 {
        history.next_id = 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Preferences;
    use tempfile::TempDir;

    #[test]
    fn missing_config_uses_defaults() {
        let dir = TempDir::new().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let config = store.load_config();
        assert!(config.pinned.is_empty());
        assert!(config.hidden.is_empty());
        assert_eq!(config.preferences, Preferences::default());
    }

    #[test]
    fn config_roundtrip_is_lossless() {
        let dir = TempDir::new().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut config = Config::default();
        config.preferences.theme = "dark".into();
        config.preferences.poll_interval_ms = 2_000;
        store.save_config(&config).unwrap();

        let loaded = store.load_config();
        assert_eq!(loaded.preferences.theme, "dark");
        assert_eq!(loaded.preferences.poll_interval_ms, 2_000);
    }

    #[test]
    fn history_roundtrip_persists_entries() {
        let dir = TempDir::new().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut history = HistoryFile::default();
        let entry = StoppedEntry {
            id: next_history_id(&mut history),
            service_id: "node:3000:/tmp".into(),
            display_name: "Test".into(),
            primary_port: 3000,
            process_name: "node".into(),
            cwd: Some("/tmp".into()),
            restart_cmd: Some("npm run dev".into()),
            started_at: Utc::now().to_rfc3339(),
            stopped_at: Utc::now().to_rfc3339(),
        };

        add_stopped_entry(&store, entry, &mut history).unwrap();
        let loaded = store.load_history();
        assert_eq!(loaded.stopped.len(), 1);
        assert_eq!(loaded.stopped[0].display_name, "Test");
    }

    #[test]
    fn prune_history_caps_at_fifty_entries() {
        let mut history = HistoryFile::default();
        for index in 0..60 {
            history.stopped.push(StoppedEntry {
                id: index.to_string(),
                service_id: format!("node:{}:/tmp", 3000 + index),
                display_name: format!("Test {index}"),
                primary_port: 3000 + index as u16,
                process_name: "node".into(),
                cwd: Some("/tmp".into()),
                restart_cmd: None,
                started_at: Utc::now().to_rfc3339(),
                stopped_at: Utc::now().to_rfc3339(),
            });
        }

        prune_history(&mut history);
        assert_eq!(history.stopped.len(), 50);
        assert_eq!(history.stopped[0].id, "10");
    }
}
