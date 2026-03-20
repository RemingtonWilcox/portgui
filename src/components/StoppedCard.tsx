import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { StoppedEntry } from "../lib/types";

function compactPath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

function timeAgo(iso: string, now: number) {
  const diffMs = now - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function StoppedCard(props: {
  entry: StoppedEntry;
  onReboot: (entry: StoppedEntry) => void;
}) {
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    onCleanup(() => {
      window.clearInterval(timer);
    });
  });

  return (
    <article class="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--color-text-muted)]" />
            <h3 class="truncate text-[13px] font-medium text-[var(--color-text-muted)]">
              {props.entry.display_name}
            </h3>
          </div>

          <div class="ml-4 mt-2 flex flex-wrap gap-1">
            <span class="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
              was :{props.entry.primary_port}
            </span>
            <span class="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
              stopped {timeAgo(props.entry.stopped_at, now())}
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

        <Show when={props.entry.restart_cmd}>
          <button
            type="button"
            onClick={() => props.onReboot(props.entry)}
            class="rounded-lg border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-teal)] transition-colors hover:brightness-110"
          >
            Restart
          </button>
        </Show>
      </div>
    </article>
  );
}
