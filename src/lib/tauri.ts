import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  HydratePayload,
  Preferences,
  ProcessUpdate,
} from "./types";

export function hydrateState() {
  return invoke<HydratePayload>("hydrate_state");
}

export function listenProcessUpdates(
  handler: (payload: ProcessUpdate) => void,
) {
  return listen<ProcessUpdate>("process-update", (event) => handler(event.payload));
}

export function killProcess(pid: number, startTime: number) {
  return invoke("kill_process", { pid, startTime });
}

export function restartProcess(pid: number, startTime: number) {
  return invoke("restart_process", { pid, startTime });
}

export function rebootService(historyEntryId: string) {
  return invoke("reboot_service", { historyEntryId });
}

export function pinProcess(pid: number, startTime: number) {
  return invoke("pin_process", { pid, startTime });
}

export function unpinProcess(serviceId: string) {
  return invoke("unpin_process", { serviceId });
}

export function hideProcess(pid: number, startTime: number) {
  return invoke("hide_process", { pid, startTime });
}

export function unhideProcess(serviceId: string) {
  return invoke("unhide_process", { serviceId });
}

export function setRestartCommand(serviceId: string, cmd: string) {
  return invoke("set_restart_command", { serviceId, cmd });
}

export function clearHistory() {
  return invoke("clear_history");
}

export function updatePreferences(prefs: Preferences) {
  return invoke("update_preferences", { prefs });
}
