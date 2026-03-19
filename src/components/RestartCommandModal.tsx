import { createEffect, createSignal, Show } from "solid-js";
import type { ServiceEntry } from "../lib/types";

function suggestCommand(entry: ServiceEntry) {
  const command = entry.cmd.join(" ").toLowerCase();
  if (command.includes("next dev") || command.includes("vite")) return "pnpm dev";
  if (command.includes("wrangler dev")) return "pnpm wrangler dev";
  if (command.includes("astro dev")) return "pnpm astro dev";
  if (command.includes("convex dev")) return "npx convex dev";
  if (command.includes("cargo run")) return "cargo run";
  if (command.includes("go run")) return "go run .";
  if (entry.process_name === "postgres") return "brew services start postgresql";
  if (entry.process_name.includes("redis")) return "brew services start redis";
  return "pnpm dev";
}

export function RestartCommandModal(props: {
  entry: ServiceEntry | null;
  savedCommand?: string | null;
  restartAfterSave?: boolean;
  onClose: () => void;
  onSave: (
    entry: ServiceEntry,
    command: string,
    restartAfterSave: boolean,
  ) => Promise<void>;
}) {
  const [command, setCommand] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (props.entry) {
      setCommand(props.savedCommand ?? suggestCommand(props.entry));
    }
  });

  return (
    <Show when={props.entry}>
      {(entry) => (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45" onClick={props.onClose}>
          <div
            class="w-[28rem] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-solid)] p-4 shadow-[0_28px_72px_rgba(0,0,0,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 class="text-sm font-semibold text-[var(--color-text)]">
              {entry().has_restart_cmd ? "Edit Restart Command" : "Add Restart Command"}
            </h2>
            <p class="mt-1 text-[11px] text-[var(--color-text-secondary)]">
              {entry().display_name}
            </p>
            <p class="mt-1 text-[11px] text-[var(--color-text-secondary)]">
              This is the command PortGUI will run when you click Restart.
            </p>

            <div class="mt-4">
              <label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                Command
              </label>
              <input
                type="text"
                value={command()}
                onInput={(event) => setCommand(event.currentTarget.value)}
                placeholder="pnpm dev"
                class="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-xs text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-teal-border)]"
              />
            </div>

            <Show when={entry().cwd}>
              <div class="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                <div class="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                  Working directory
                </div>
                <div class="truncate text-[11px] text-[var(--color-text-secondary)]">
                  {entry().cwd}
                </div>
              </div>
            </Show>

            <div class="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={props.onClose}
                class="rounded-lg border border-[var(--color-border)] bg-[var(--color-button-neutral)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-button-neutral-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving() || command().trim().length === 0}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await props.onSave(
                      entry(),
                      command().trim(),
                      !!props.restartAfterSave,
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                class="rounded-lg border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-teal)] disabled:opacity-60"
              >
                {saving()
                  ? props.restartAfterSave
                    ? "Saving and Restarting..."
                    : "Saving..."
                  : props.restartAfterSave
                    ? "Save and Restart"
                    : "Save command"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
