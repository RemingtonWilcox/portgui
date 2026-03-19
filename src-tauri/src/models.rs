use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ServiceStatus {
    Healthy,
    Warning,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServiceEntry {
    pub pid: u32,
    pub start_time: u64,
    pub service_id: String,
    pub display_name: String,
    pub ports: Vec<u16>,
    pub process_name: String,
    pub cmd: Vec<String>,
    pub cwd: Option<String>,
    pub uptime_secs: u64,
    pub status: ServiceStatus,
    pub is_pinned: bool,
    pub has_restart_cmd: bool,
    pub warning_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoppedEntry {
    pub id: String,
    pub service_id: String,
    pub display_name: String,
    pub primary_port: u16,
    pub process_name: String,
    pub cwd: Option<String>,
    pub restart_cmd: Option<String>,
    pub stopped_at: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default)]
pub struct PinnedConfig {
    pub restart_cmd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct Preferences {
    pub theme: String,
    pub poll_interval_ms: u64,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            poll_interval_ms: 1_500,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default)]
pub struct Config {
    pub pinned: HashMap<String, PinnedConfig>,
    pub hidden: Vec<String>,
    pub preferences: Preferences,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct HistoryFile {
    pub stopped: Vec<StoppedEntry>,
    pub next_id: u64,
}

impl Default for HistoryFile {
    fn default() -> Self {
        Self {
            stopped: Vec::new(),
            next_id: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HydratePayload {
    pub active: Vec<ServiceEntry>,
    pub history: Vec<StoppedEntry>,
    pub config: Config,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcessUpdate {
    pub active: Vec<ServiceEntry>,
    pub newly_stopped: Vec<StoppedEntry>,
}

pub fn make_service_id(process_name: &str, primary_port: u16, cwd: Option<&str>) -> String {
    let cwd_part = cwd.unwrap_or("unknown");
    format!("{process_name}:{primary_port}:{cwd_part}")
}

pub fn runtime_key(entry: &ServiceEntry) -> (u32, u64) {
    (entry.pid, entry.start_time)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn make_service_id_uses_cwd_when_present() {
        let id = make_service_id("node", 3000, Some("/tmp/demo"));
        assert_eq!(id, "node:3000:/tmp/demo");
    }

    #[test]
    fn make_service_id_falls_back_to_unknown() {
        let id = make_service_id("postgres", 5432, None);
        assert_eq!(id, "postgres:5432:unknown");
    }

    #[test]
    fn config_roundtrips() {
        let config = Config {
            pinned: HashMap::from([(
                "node:3000:/tmp/demo".into(),
                PinnedConfig {
                    restart_cmd: Some("pnpm dev".into()),
                },
            )]),
            hidden: vec!["mDNSResponder:5353:unknown".into()],
            preferences: Preferences::default(),
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.preferences.poll_interval_ms, 1_500);
        assert_eq!(parsed.pinned.len(), 1);
        assert_eq!(parsed.hidden.len(), 1);
    }

    #[test]
    fn history_defaults_are_stable() {
        let history = HistoryFile::default();
        assert_eq!(history.next_id, 1);
        assert!(history.stopped.is_empty());
    }
}
