export type ServiceStatus = "Healthy" | "Warning" | "Unknown";

export interface ServiceEntry {
  pid: number;
  start_time: number;
  service_id: string;
  favorite_id: string;
  display_name: string;
  auto_display_name: string;
  ports: number[];
  process_name: string;
  cmd: string[];
  cwd: string | null;
  uptime_secs: number;
  status: ServiceStatus;
  is_classified: boolean;
  is_pinned: boolean;
  has_restart_cmd: boolean;
  warning_reason: string | null;
}

export interface StoppedEntry {
  id: string;
  service_id: string;
  display_name: string;
  primary_port: number;
  process_name: string;
  cwd: string | null;
  restart_cmd: string | null;
  stopped_at: string;
  started_at: string;
}

export interface PinnedConfig {
  restart_cmd: string | null;
  display_name: string | null;
  process_name: string | null;
  cwd: string | null;
  primary_port: number | null;
}

export interface Preferences {
  theme: Theme;
  poll_interval_ms: number;
}

export interface Config {
  pinned: Record<string, PinnedConfig>;
  custom_names: Record<string, string>;
  hidden: string[];
  preferences: Preferences;
}

export interface HydratePayload {
  active: ServiceEntry[];
  history: StoppedEntry[];
  config: Config;
}

export interface ProcessUpdate {
  active: ServiceEntry[];
  newly_stopped: StoppedEntry[];
}

export type Theme = "system" | "light" | "dark";

export function defaultConfig(): Config {
  return {
    pinned: {},
    custom_names: {},
    hidden: [],
    preferences: {
      theme: "system",
      poll_interval_ms: 1500,
    },
  };
}
