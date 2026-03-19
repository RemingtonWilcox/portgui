import { For, Show } from "solid-js";
import type { Config, Theme } from "../lib/types";

export function SettingsPanel(props: {
  config: Config;
  open: boolean;
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
  onPollChange: (pollMs: number) => void;
  onUnhide: (serviceId: string) => void;
}) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-40 bg-black/35" onClick={props.onClose}>
        <aside
          class="absolute right-0 top-0 h-full w-80 border-l border-[var(--color-border)] bg-[var(--color-bg-solid)] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.24)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div class="mb-5 flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-[var(--color-text)]">Settings</h2>
              <p class="text-[11px] text-[var(--color-text-secondary)]">
                Theme, scan speed, and hidden services
              </p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]"
            >
              Close
            </button>
          </div>

          <section class="mb-5">
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              Theme
            </div>
            <div class="flex gap-2">
              {(["system", "light", "dark"] as Theme[]).map((theme) => (
                <button
                  type="button"
                  onClick={() => props.onThemeChange(theme)}
                  class="rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors"
                  classList={{
                    "border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] text-[var(--color-teal)]":
                      props.config.preferences.theme === theme,
                    "border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-secondary)]":
                      props.config.preferences.theme !== theme,
                  }}
                >
                  {theme}
                </button>
              ))}
            </div>
          </section>

          <section class="mb-5">
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              Scan interval
            </div>
            <div class="mb-2 text-[11px] text-[var(--color-text-secondary)]">
              {(props.config.preferences.poll_interval_ms / 1000).toFixed(1)}s
            </div>
            <input
              type="range"
              min="1000"
              max="5000"
              step="500"
              value={props.config.preferences.poll_interval_ms}
              onInput={(event) => props.onPollChange(Number(event.currentTarget.value))}
              class="w-full accent-[var(--color-teal)]"
            />
          </section>

          <section>
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              Hidden Services
            </div>
            <Show
              when={props.config.hidden.length > 0}
              fallback={
                <div class="rounded-xl border border-dashed border-[var(--color-border)] px-3 py-3 text-[11px] text-[var(--color-text-secondary)]">
                  No hidden services.
                </div>
              }
            >
              <div class="space-y-2">
                <For each={props.config.hidden}>
                  {(serviceId) => (
                    <div class="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                      <div class="min-w-0 truncate text-[11px] text-[var(--color-text-secondary)]">
                        {serviceId}
                      </div>
                      <button
                        type="button"
                        onClick={() => props.onUnhide(serviceId)}
                        class="shrink-0 text-[10px] font-medium text-[var(--color-teal)]"
                      >
                        Unhide
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </aside>
      </div>
    </Show>
  );
}
