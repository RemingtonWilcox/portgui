import { createEffect, createSignal, Show } from "solid-js";

export function RenameFavoriteModal(props: {
  open: boolean;
  currentName: string | null;
  fallbackName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      setName(props.currentName ?? "");
    }
  });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45" onClick={props.onClose}>
        <div
          class="w-[28rem] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-solid)] p-4 shadow-[0_28px_72px_rgba(0,0,0,0.28)]"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 class="text-sm font-semibold text-[var(--color-text)]">
            Rename Service
          </h2>
          <p class="mt-1 text-[11px] text-[var(--color-text-secondary)]">
            Leave blank to use the automatic name.
          </p>
          <p class="mt-1 text-[11px] text-[var(--color-text-secondary)]">
            Current automatic name: {props.fallbackName}
          </p>

          <div class="mt-4">
            <label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              Display Name
            </label>
            <input
              type="text"
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
              placeholder={props.fallbackName}
              class="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-xs text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-teal-border)]"
            />
          </div>

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
              disabled={saving()}
              onClick={async () => {
                setSaving(true);
                try {
                  await props.onSave(name());
                } finally {
                  setSaving(false);
                }
              }}
              class="rounded-lg border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-teal)] disabled:opacity-60"
            >
              {saving() ? "Saving..." : name().trim() ? "Save name" : "Use automatic name"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
