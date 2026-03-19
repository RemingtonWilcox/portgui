import { onCleanup, onMount, Show } from "solid-js";
import type { ServiceEntry } from "../lib/types";

function formatUptime(secs: number) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) {
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  }

  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

function compactPath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export function ServiceCard(props: {
  entry: ServiceEntry;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onKill: (entry: ServiceEntry) => void;
  onRestart: (entry: ServiceEntry) => void;
  onConfigureRestart: (entry: ServiceEntry, restartAfterSave: boolean) => void;
  onPinToggle: (entry: ServiceEntry) => void;
  onHide: (entry: ServiceEntry) => void;
  pendingAction?: "kill" | "restart";
}) {
  let menuRef: HTMLDivElement | undefined;
  let menuButtonRef: HTMLButtonElement | undefined;

  onMount(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!props.menuOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef?.contains(target) || menuButtonRef?.contains(target)) return;
      props.onMenuOpenChange(false);
    };

    // Use click (not pointerdown) with capture:false so the menu button's
    // onClick fires first and toggles the menu before this handler runs.
    window.addEventListener("click", handleClickOutside);
    onCleanup(() => {
      window.removeEventListener("click", handleClickOutside);
    });
  });

  const isBusy = () => props.pendingAction !== undefined;
  const serviceKind = () => {
    const process = props.entry.process_name.toLowerCase();
    if (process.includes("postgres") || process.includes("redis")) {
      return "infra";
    }
    return null;
  };

  return (
    <article
      class="card-hover relative overflow-visible rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.08)]"
      classList={{
        "scale-[0.995] opacity-65": props.pendingAction === "kill",
        "z-30": props.menuOpen,
      }}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              classList={{
                "bg-[var(--color-teal)] dot-glow-teal":
                  props.entry.status === "Healthy",
                "bg-[var(--color-amber)] dot-glow-amber":
                  props.entry.status === "Warning",
                "bg-[var(--color-text-secondary)]":
                  props.entry.status === "Unknown",
              }}
            />
            <h3 class="truncate text-[13px] font-semibold text-[var(--color-text)]">
              {props.entry.display_name}
            </h3>
            <Show when={props.entry.is_pinned}>
              <span class="rounded-full border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-1.5 py-px text-[9px] font-medium text-[var(--color-teal)]">
                pinned
              </span>
            </Show>
            <Show when={serviceKind()}>
              {(kind) => (
                <span class="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-px text-[9px] font-medium text-[var(--color-text-secondary)]">
                  {kind()}
                </span>
              )}
            </Show>
            <Show when={props.entry.warning_reason}>
              <span class="rounded-full border border-[var(--color-amber-border)] bg-[var(--color-amber-bg)] px-1.5 py-px text-[9px] font-medium text-[var(--color-amber)]">
                {props.entry.warning_reason}
              </span>
            </Show>
          </div>

          <div class="ml-4 mt-2 flex flex-wrap gap-1">
            {props.entry.ports.map((port) => (
              <span class="rounded-full border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-teal)]">
                :{port}
              </span>
            ))}
            <span class="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
              {props.entry.process_name}
            </span>
            <span class="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
              {formatUptime(props.entry.uptime_secs)}
            </span>
          </div>

          <Show when={props.entry.cwd}>
            <div
              class="ml-4 mt-1 truncate text-[10.5px] text-[var(--color-text-muted)]"
              title={props.entry.cwd ?? undefined}
            >
              {compactPath(props.entry.cwd ?? "")}
            </div>
          </Show>
        </div>

        <div class="relative flex shrink-0 items-start gap-1">
          <button
            type="button"
            ref={menuButtonRef}
            disabled={isBusy()}
            onClick={() => props.onMenuOpenChange(!props.menuOpen)}
            class="rounded-lg border border-[var(--color-border)] bg-[var(--color-button-neutral)] px-2 py-1 text-[10px] font-medium text-[var(--color-button-neutral-text)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="More actions"
          >
            ...
          </button>

          <Show when={props.menuOpen}>
            <div
              ref={menuRef}
              class="dropdown-animate absolute right-0 top-9 z-50 min-w-36 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-overlay)] p-1 shadow-[0_24px_48px_rgba(0,0,0,0.3)]"
            >
              <Show when={props.entry.has_restart_cmd}>
                <button
                  type="button"
                  onClick={() => {
                    props.onMenuOpenChange(false);
                    props.onConfigureRestart(props.entry, false);
                  }}
                  class="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--color-text)] hover:bg-[var(--color-bg-card)]"
                >
                  Edit command
                </button>
              </Show>
              <Show when={!props.entry.has_restart_cmd}>
                <button
                  type="button"
                  onClick={() => {
                    props.onMenuOpenChange(false);
                    props.onConfigureRestart(props.entry, true);
                  }}
                  class="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--color-text)] hover:bg-[var(--color-bg-card)]"
                >
                  Restart...
                </button>
              </Show>
              <button
                type="button"
                onClick={() => {
                  props.onMenuOpenChange(false);
                  props.onPinToggle(props.entry);
                }}
                class="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--color-text)] hover:bg-[var(--color-bg-card)]"
              >
                {props.entry.is_pinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onMenuOpenChange(false);
                  props.onHide(props.entry);
                }}
                class="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--color-text)] hover:bg-[var(--color-bg-card)]"
              >
                Hide
              </button>
            </div>
          </Show>

          <button
            type="button"
            disabled={isBusy()}
            onClick={() => props.onKill(props.entry)}
            class="rounded-lg border border-[var(--color-button-neutral-border)] bg-[var(--color-button-neutral)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-button-neutral-text)] transition-colors hover:border-[var(--color-red-border)] hover:bg-[var(--color-red-bg)] hover:text-[var(--color-red)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.pendingAction === "kill" ? "Stopping..." : "Kill"}
          </button>

          <Show when={props.entry.has_restart_cmd}>
            <button
              type="button"
              disabled={isBusy()}
              onClick={() => props.onRestart(props.entry)}
              class="rounded-lg border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-teal)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {props.pendingAction === "restart" ? "Restarting..." : "Restart"}
            </button>
          </Show>
        </div>
      </div>
    </article>
  );
}
