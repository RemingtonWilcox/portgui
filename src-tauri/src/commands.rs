use crate::models::{Config, HydratePayload, PinnedConfig, Preferences, ServiceEntry};
use crate::process_mgmt;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn hydrate_state(state: State<'_, AppState>) -> Result<HydratePayload, String> {
    Ok(state.hydrate_payload())
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
pub fn pin_process(state: State<'_, AppState>, pid: u32, start_time: u64) -> Result<(), String> {
    let service_id = resolve_service_id(state.inner(), pid, start_time)?;
    let mut inner = state.inner.lock().expect("app state poisoned");
    inner.config.pinned.entry(service_id).or_default();
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn unpin_process(state: State<'_, AppState>, service_id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    inner.config.pinned.remove(&service_id);
    let config = inner.config.clone();
    sync_active_entries(&mut inner.active, &config);
    state.store.save_config(&inner.config)
}

#[tauri::command]
pub fn hide_process(state: State<'_, AppState>, pid: u32, start_time: u64) -> Result<(), String> {
    let service_id = resolve_service_id(state.inner(), pid, start_time)?;
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
    service_id: String,
    cmd: String,
) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("app state poisoned");
    let pinned = inner
        .config
        .pinned
        .entry(service_id)
        .or_insert_with(|| PinnedConfig { restart_cmd: None });
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

fn resolve_service_id(state: &AppState, pid: u32, start_time: u64) -> Result<String, String> {
    state
        .inner
        .lock()
        .expect("app state poisoned")
        .active
        .iter()
        .find(|entry| entry.pid == pid && entry.start_time == start_time)
        .map(|entry| entry.service_id.clone())
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
        entry.is_pinned = config.pinned.contains_key(&entry.service_id);
        entry.has_restart_cmd = config
            .pinned
            .get(&entry.service_id)
            .and_then(|pinned| pinned.restart_cmd.as_ref())
            .is_some();
    }
}
