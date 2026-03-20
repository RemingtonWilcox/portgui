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

export function launchPinnedService(favoriteId: string) {
  return invoke("launch_pinned_service", { favoriteId });
}

export function setCustomName(favoriteId: string, name: string) {
  return invoke("set_custom_name", { favoriteId, name });
}

export function pinProcess(pid: number, startTime: number) {
  return invoke("pin_process", { pid, startTime });
}

export function unpinProcess(favoriteId: string) {
  return invoke("unpin_process", { favoriteId });
}

export function hideProcess(pid: number, startTime: number) {
  return invoke("hide_process", { pid, startTime });
}

export function unhideProcess(serviceId: string) {
  return invoke("unhide_process", { serviceId });
}

export function setRestartCommand(favoriteId: string, cmd: string) {
  return invoke("set_restart_command", { favoriteId, cmd });
}

export function clearHistory() {
  return invoke("clear_history");
}

export function updatePreferences(prefs: Preferences) {
  return invoke("update_preferences", { prefs });
}
