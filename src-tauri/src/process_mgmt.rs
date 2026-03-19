use crate::state::AppState;
use std::io;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

pub fn kill_process(state: &AppState, pid: u32, start_time: u64) -> Result<(), String> {
    resolve_active_service(state, pid, start_time)?;
    signal_with_timeout(pid)
}

pub fn restart_process(state: &AppState, pid: u32, start_time: u64) -> Result<(), String> {
    let entry = resolve_active_service(state, pid, start_time)?;
    let cwd = entry
        .cwd
        .as_deref()
        .ok_or_else(|| "process has no readable working directory".to_string())?;
    let restart_cmd = {
        let inner = state.inner.lock().expect("app state poisoned");
        inner
            .config
            .pinned
            .get(&entry.service_id)
            .and_then(|config| config.restart_cmd.clone())
            .ok_or_else(|| "no restart command configured".to_string())?
    };

    signal_with_timeout(pid)?;
    spawn_command(&restart_cmd, cwd)
}

pub fn reboot_service(state: &AppState, history_entry_id: &str) -> Result<(), String> {
    let (restart_cmd, cwd) = {
        let inner = state.inner.lock().expect("app state poisoned");
        let entry = inner
            .history
            .stopped
            .iter()
            .find(|entry| entry.id == history_entry_id)
            .ok_or_else(|| "history entry not found".to_string())?;

        let restart_cmd = entry
            .restart_cmd
            .clone()
            .ok_or_else(|| "history entry has no restart command".to_string())?;
        let cwd = entry
            .cwd
            .clone()
            .ok_or_else(|| "history entry has no working directory".to_string())?;
        (restart_cmd, cwd)
    };

    spawn_command(&restart_cmd, &cwd)
}

fn resolve_active_service(
    state: &AppState,
    pid: u32,
    start_time: u64,
) -> Result<crate::models::ServiceEntry, String> {
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

fn signal_with_timeout(pid: u32) -> Result<(), String> {
    send_signal(pid, libc::SIGTERM)?;

    for _ in 0..30 {
        if !process_exists(pid) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }

    send_signal(pid, libc::SIGKILL)?;
    Ok(())
}

fn send_signal(pid: u32, signal: i32) -> Result<(), String> {
    let result = unsafe { libc::kill(pid as i32, signal) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error().to_string())
    }
}

fn process_exists(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as i32, 0) };
    if result == 0 {
        return true;
    }
    io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

fn spawn_command(command: &str, cwd: &str) -> Result<(), String> {
    let child = Command::new("/bin/zsh")
        .args(["-il", "-c", command])
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| err.to_string())?;

    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let _ = sender.send(child.wait_with_output());
    });

    match receiver.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(output)) => {
            if output.status.success() {
                Ok(())
            } else {
                Err(format_spawn_output(&output.stderr, &output.stdout))
            }
        }
        Ok(Err(err)) => Err(err.to_string()),
        Err(mpsc::RecvTimeoutError::Timeout) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

fn format_spawn_output(stderr: &[u8], stdout: &[u8]) -> String {
    let stderr = String::from_utf8_lossy(stderr);
    let stdout = String::from_utf8_lossy(stdout);
    let combined = if stderr.trim().is_empty() {
        stdout.to_string()
    } else {
        stderr.to_string()
    };
    let mut lines: Vec<&str> = combined.lines().rev().take(5).collect();
    lines.reverse();
    let excerpt = lines.join("\n");

    if excerpt.trim().is_empty() {
        "process exited before it became healthy".to_string()
    } else {
        format!("failed to start:\n{excerpt}")
    }
}
