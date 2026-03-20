use crate::models::{Config, HydratePayload, PinnedConfig, Preferences, ServiceEntry};
use crate::process_mgmt;
use crate::restart_cmd::infer_restart_command;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn hydrate_state(state: State<'_, AppState>) -> Result<HydratePayload, String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    let active_snapshot = inner.active.clone();
    let mut config_changed = false;

    for entry in &active_snapshot {
        if let Some(pinned) = inner.config.pinned.get_mut(&entry.favorite_id) {
            if pinned.restart_cmd.is_none() {
                pinned.restart_cmd = Some(infer_restart_command(entry));
                config_changed = true;
            }
        }
    }

    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    let payload = HydratePayload {
        active: inner.active.clone(),
        history: inner.history.stopped.clone(),
        config,
    };
    drop(inner);

    if config_changed {
        state.store.save_config(&payload.config)?;
    }

    Ok(payload)
}

#[tauri::command]
pub fn kill_process(state: State<'_, AppState>, pid: u32, start_time: u64) -> Result<(), String> {
    process_mgmt::kill_process(state.inner(), pid, start_time)
}

#[tauri::command]
pub fn restart_process(
    state: State<'_, AppState>,
    pid: u32,
    start_time: u64,
) -> Result<(), String> {
    process_mgmt::restart_process(state.inner(), pid, start_time)
}

#[tauri::command]
pub fn reboot_service(state: State<'_, AppState>, history_entry_id: String) -> Result<(), String> {
    process_mgmt::reboot_service(state.inner(), &history_entry_id)
}

#[tauri::command]
pub fn launch_pinned_service(
    state: State<'_, AppState>,
    favorite_id: String,
) -> Result<(), String> {
    process_mgmt::launch_pinned_service(state.inner(), &favorite_id)
}

#[tauri::command]
pub fn set_custom_name(
    state: State<'_, AppState>,
    favorite_id: String,
    name: String,
) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    let trimmed = name.trim();
    if trimmed.is_empty() {
        inner.config.custom_names.remove(&favorite_id);
    } else {
        inner
            .config
            .custom_names
            .insert(favorite_id, trimmed.to_string());
    }
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn pin_process(state: State<'_, AppState>, pid: u32, start_time: u64) -> Result<(), String> {
    let entry = resolve_active_entry(state.inner(), pid, start_time)?;
    let mut inner = state.inner.lock().expect("app state poisoned");
    let pinned = inner
        .config
        .pinned
        .entry(entry.favorite_id.clone())
        .or_default();
    upsert_pinned_metadata(pinned, &entry);
    if pinned.restart_cmd.is_none() {
        pinned.restart_cmd = Some(infer_restart_command(&entry));
    }
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn unpin_process(state: State<'_, AppState>, favorite_id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    inner.config.pinned.remove(&favorite_id);
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn hide_process(state: State<'_, AppState>, pid: u32, start_time: u64) -> Result<(), String> {
    let service_id = resolve_active_entry(state.inner(), pid, start_time)?.service_id;
    let mut inner = state.inner.lock().expect("app state poisoned");
    if !inner
        .config
        .hidden
        .iter()
        .any(|hidden| hidden == &service_id)
    {
        inner.config.hidden.push(service_id);
    }
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn unhide_process(state: State<'_, AppState>, service_id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    inner.config.hidden.retain(|hidden| hidden != &service_id);
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn set_restart_command(
    state: State<'_, AppState>,
    favorite_id: String,
    cmd: String,
) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    let entry = inner
        .active
        .iter()
        .find(|entry| entry.favorite_id == favorite_id)
        .cloned();
    let pinned = inner
        .config
        .pinned
        .entry(favorite_id)
        .or_default();
    if let Some(entry) = entry.as_ref() {
        upsert_pinned_metadata(pinned, entry);
    }
    pinned.restart_cmd = Some(cmd);
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    inner.history.stopped.clear();
    state.store.save_history(&inner.history)
}

#[tauri::command]
pub fn update_preferences(state: State<'_, AppState>, prefs: Preferences) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    inner.config.preferences = Preferences {
        theme: prefs.theme,
        poll_interval_ms: prefs.poll_interval_ms.clamp(1_000, 5_000),
    };
    state.store.save_config(&inner.config)
}

fn resolve_active_entry(state: &AppState, pid: u32, start_time: u64) -> Result<ServiceEntry, String> {
    state
        .inner
        .lock()
        .expect("app state poisoned")
        .active
        .iter()
        .find(|entry| entry.pid == pid && entry.start_time == start_time)
        .cloned()
        .ok_or_else(|| "process is no longer active".to_string())
}

fn sync_active_entries(active: &mut Vec<ServiceEntry>, config: &Config) {
    active.retain(|entry| {
        !config
            .hidden
            .iter()
            .any(|hidden| hidden == &entry.service_id)
    });
    for entry in active.iter_mut() {
        entry.is_pinned = config.pinned.contains_key(&entry.favorite_id);
        entry.has_restart_cmd = config
            .pinned
            .get(&entry.favorite_id)
            .and_then(|pinned| pinned.restart_cmd.as_ref())
            .is_some();
        entry.display_name = config
            .custom_names
            .get(&entry.favorite_id)
            .cloned()
            .or_else(|| {
                config
                    .pinned
                    .get(&entry.favorite_id)
                    .and_then(|pinned| pinned.display_name.clone())
            })
            .unwrap_or_else(|| entry.auto_display_name.clone());
    }
}

fn upsert_pinned_metadata(pinned: &mut PinnedConfig, entry: &ServiceEntry) {
    pinned.display_name = Some(entry.auto_display_name.clone());
    pinned.process_name = Some(entry.process_name.clone());
    pinned.cwd = entry.cwd.clone();
    pinned.primary_port = entry.ports.first().copied();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_pinned_metadata_preserves_auto_name_when_custom_name_exists() {
        let mut pinned = PinnedConfig {
            custom_name: Some("My Override".into()),
            display_name: Some("Automatic Name".into()),
            ..PinnedConfig::default()
        };
        let entry = ServiceEntry {
            pid: 1,
            start_time: 1,
            service_id: "python:4179:/tmp/demo".into(),
            favorite_id: "python:/tmp/demo".into(),
            display_name: "My Override".into(),
            auto_display_name: "Automatic Name".into(),
            ports: vec![4179],
            process_name: "python".into(),
            cmd: vec!["python".into(), "-m".into(), "http.server".into()],
            cwd: Some("/tmp/demo".into()),
            uptime_secs: 10,
            status: crate::models::ServiceStatus::Healthy,
            is_classified: true,
            is_pinned: true,
            has_restart_cmd: true,
            warning_reason: None,
        };

        upsert_pinned_metadata(&mut pinned, &entry);

        assert_eq!(pinned.custom_name.as_deref(), Some("My Override"));
        assert_eq!(pinned.display_name.as_deref(), Some("Automatic Name"));
        assert_eq!(pinned.process_name.as_deref(), Some("python"));
        assert_eq!(pinned.cwd.as_deref(), Some("/tmp/demo"));
        assert_eq!(pinned.primary_port, Some(4179));
    }
}
