use crate::classifier::is_dev_related;
use crate::display_name::{derive_display_name, inspect_project, ProjectMetadata};
use crate::models::{
    make_favorite_id, make_service_id, runtime_key, Config, ProcessUpdate, ServiceEntry,
    ServiceStatus, StoppedEntry,
};
use crate::persistence::{next_history_id, prune_history};
use crate::restart_cmd::infer_restart_command;
use crate::state::AppState;
use chrono::{TimeZone, Utc};
use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::thread;
use std::time::Duration;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Emitter};

pub fn spawn_scanner(app_handle: AppHandle, state: AppState) {
    thread::spawn(move || {
        let mut system = System::new_all();
        let mut project_cache: HashMap<String, ProjectMetadata> = HashMap::new();

        loop {
            let config = {
                state
                    .inner
                    .lock()
                    .expect("scanner state poisoned")
                    .config
                    .clone()
            };

            match scan_services(&mut system, &config, &mut project_cache) {
                Ok(active) => {
                    if let Err(err) = apply_scan_results(&app_handle, &state, active) {
                        eprintln!("scanner apply error: {err}");
                    }
                }
                Err(err) => eprintln!("scanner scan error: {err}"),
            }

            let sleep_ms = {
                state
                    .inner
                    .lock()
                    .expect("scanner state poisoned")
                    .config
                    .preferences
                    .poll_interval_ms
                    .clamp(1_000, 5_000)
            };
            thread::sleep(Duration::from_millis(sleep_ms));
        }
    });
}

fn scan_services(
    system: &mut System,
    config: &Config,
    project_cache: &mut HashMap<String, ProjectMetadata>,
) -> Result<Vec<ServiceEntry>, String> {
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cmd(UpdateKind::Always)
            .with_cwd(UpdateKind::Always),
    );

    let mut ports_by_pid: HashMap<u32, BTreeSet<u16>> = HashMap::new();
    let sockets = get_sockets_info(
        AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6,
        ProtocolFlags::TCP,
    )
    .map_err(|err| err.to_string())?;

    for socket in sockets {
        let ProtocolSocketInfo::Tcp(tcp) = socket.protocol_socket_info else {
            continue;
        };
        if tcp.state != TcpState::Listen {
            continue;
        }

        for pid in socket.associated_pids {
            ports_by_pid.entry(pid).or_default().insert(tcp.local_port);
        }
    }

    let mut active = Vec::new();
    for (pid, ports) in ports_by_pid {
        let Some(process) = system.process(Pid::from_u32(pid)) else {
            continue;
        };

        let ports: Vec<u16> = ports.into_iter().collect();
        let Some(primary_port) = ports.first().copied() else {
            continue;
        };

        let process_name = process.name().to_string_lossy().to_string();
        let cmd: Vec<String> = process
            .cmd()
            .iter()
            .map(|segment| segment.to_string_lossy().to_string())
            .collect();
        let cwd = process.cwd().map(|path| path.to_string_lossy().to_string());
        let favorite_id = make_favorite_id(&process_name, cwd.as_deref());
        let service_id = make_service_id(&process_name, primary_port, cwd.as_deref());
        let is_pinned = config.pinned.contains_key(&favorite_id);
        let has_restart_cmd = config
            .pinned
            .get(&favorite_id)
            .and_then(|pinned| pinned.restart_cmd.as_ref())
            .is_some();
        let is_hidden = config.hidden.iter().any(|hidden| hidden == &service_id);
        let project = cwd
            .as_deref()
            .map(|path| {
                project_cache
                    .entry(path.to_string())
                    .or_insert_with(|| inspect_project(Some(path)))
                    .clone()
            })
            .unwrap_or_default();

        if is_hidden {
            continue;
        }

        let is_classified = is_dev_related(&process_name, &ports, &cmd, &project, false, false);
        let derived_display_name = if is_classified || is_pinned {
            derive_display_name(&cmd, &project, &process_name, cwd.as_deref(), primary_port)
        } else {
            derive_display_name(
                &cmd,
                &ProjectMetadata::default(),
                &process_name,
                cwd.as_deref(),
                primary_port,
            )
        };
        let display_name = config
            .custom_names
            .get(&favorite_id)
            .cloned()
            .unwrap_or_else(|| derived_display_name.clone());
        let status = if cwd.is_some() || !cmd.is_empty() {
            ServiceStatus::Healthy
        } else {
            ServiceStatus::Unknown
        };

        active.push(ServiceEntry {
            pid,
            start_time: process.start_time(),
            service_id,
            favorite_id,
            display_name,
            auto_display_name: derived_display_name,
            ports,
            process_name,
            cmd,
            cwd,
            uptime_secs: process.run_time(),
            status,
            is_classified,
            is_pinned,
            has_restart_cmd,
            warning_reason: None,
        });
    }

    active.sort_by(|left, right| {
        right
            .is_pinned
            .cmp(&left.is_pinned)
            .then_with(|| right.is_classified.cmp(&left.is_classified))
            .then_with(|| left.ports.first().cmp(&right.ports.first()))
            .then_with(|| left.display_name.cmp(&right.display_name))
    });

    Ok(active)
}

fn apply_scan_results(
    app_handle: &AppHandle,
    state: &AppState,
    active: Vec<ServiceEntry>,
) -> Result<(), String> {
    let mut inner = state.inner.lock().expect("scanner state poisoned");
    let previous = inner.active.clone();
    let changed = active_entries_changed(&previous, &active);
    let active_keys: HashSet<(u32, u64)> = active.iter().map(runtime_key).collect();
    let mut newly_stopped = Vec::new();
    let mut config_changed = false;

    for entry in &active {
        if let Some(pinned) = inner.config.pinned.get_mut(&entry.favorite_id) {
            if pinned.restart_cmd.is_none() {
                pinned.restart_cmd = Some(infer_restart_command(entry));
                config_changed = true;
            }
            pinned.display_name = Some(entry.auto_display_name.clone());
            pinned.process_name = Some(entry.process_name.clone());
            pinned.cwd = entry.cwd.clone();
            pinned.primary_port = entry.ports.first().copied();
        }
    }

    for entry in previous
        .iter()
        .filter(|entry| !active_keys.contains(&runtime_key(entry)))
    {
        if !should_track_history(entry) {
            continue;
        }

        let started_at = Utc
            .timestamp_opt(entry.start_time as i64, 0)
            .single()
            .unwrap_or_else(Utc::now)
            .to_rfc3339();
        let stopped = StoppedEntry {
            id: next_history_id(&mut inner.history),
            service_id: entry.service_id.clone(),
            display_name: entry.display_name.clone(),
            primary_port: entry.ports.first().copied().unwrap_or_default(),
            process_name: entry.process_name.clone(),
            cwd: entry.cwd.clone(),
            restart_cmd: inner
                .config
                .pinned
                .get(&entry.favorite_id)
                .and_then(|config| config.restart_cmd.clone()),
            started_at,
            stopped_at: Utc::now().to_rfc3339(),
        };
        newly_stopped.push(stopped.clone());
        inner.history.stopped.push(stopped);
    }

    if !newly_stopped.is_empty() {
        prune_history(&mut inner.history);
        state.store.save_history(&inner.history)?;
    }

    if config_changed {
        state.store.save_config(&inner.config)?;
    }

    inner.active = active.clone();
    drop(inner);

    if changed || !newly_stopped.is_empty() {
        app_handle
            .emit(
                "process-update",
                ProcessUpdate {
                    active,
                    newly_stopped,
                },
            )
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

fn active_entries_changed(previous: &[ServiceEntry], active: &[ServiceEntry]) -> bool {
    if previous.len() != active.len() {
        return true;
    }

    previous
        .iter()
        .zip(active.iter())
        .any(|(left, right)| !same_service_for_emit(left, right))
}

fn same_service_for_emit(left: &ServiceEntry, right: &ServiceEntry) -> bool {
    left.pid == right.pid
        && left.start_time == right.start_time
        && left.service_id == right.service_id
        && left.favorite_id == right.favorite_id
        && left.display_name == right.display_name
        && left.ports == right.ports
        && left.process_name == right.process_name
        && left.cmd == right.cmd
        && left.cwd == right.cwd
        && left.status == right.status
        && left.is_classified == right.is_classified
        && left.is_pinned == right.is_pinned
        && left.has_restart_cmd == right.has_restart_cmd
        && left.warning_reason == right.warning_reason
}

fn should_track_history(entry: &ServiceEntry) -> bool {
    entry.is_classified || entry.is_pinned
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry() -> ServiceEntry {
        ServiceEntry {
            pid: 123,
            start_time: 456,
            service_id: "node:3000:/tmp/demo".into(),
            favorite_id: "node:/tmp/demo".into(),
            display_name: "Demo".into(),
            auto_display_name: "Demo".into(),
            ports: vec![3000],
            process_name: "node".into(),
            cmd: vec!["node".into(), "vite".into()],
            cwd: Some("/tmp/demo".into()),
            uptime_secs: 10,
            status: ServiceStatus::Healthy,
            is_classified: true,
            is_pinned: false,
            has_restart_cmd: false,
            warning_reason: None,
        }
    }

    #[test]
    fn active_entries_changed_ignores_uptime_only() {
        let previous = vec![sample_entry()];
        let mut active = vec![sample_entry()];
        active[0].uptime_secs = 11;

        assert!(!active_entries_changed(&previous, &active));
    }

    #[test]
    fn active_entries_changed_detects_real_differences() {
        let previous = vec![sample_entry()];
        let mut active = vec![sample_entry()];
        active[0].ports = vec![3001];

        assert!(active_entries_changed(&previous, &active));
    }
}
