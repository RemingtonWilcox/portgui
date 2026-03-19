export function Header(props: {
  activeCount: number;
  stoppedCount: number;
  onSettingsClick: () => void;
}) {
  return (
    <header
      data-tauri-drag-region
      class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 select-none"
    >
      <div data-tauri-drag-region class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-[#0d9488] to-[#2dd4bf] text-[#06201d] shadow-[0_8px_24px_rgba(45,212,191,0.22)]">
          <svg width="16" height="16" viewBox="0 0 32 32">
            <path
              d="M8 4.5A.5.5 0 0 1 8.5 4H17c5 0 9 3.36 9 7.5S22 19 17 19h-4v8.5a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5ZM13 8v7h4c2.76 0 5-1.57 5-3.5S19.76 8 17 8Z"
              fill="currentColor"
              fill-rule="evenodd"
            />
          </svg>
        </div>
        <div data-tauri-drag-region>
          <div class="text-[14px] font-semibold tracking-tight text-[var(--color-text)]">
            PortGUI
          </div>
          <div class="text-[10px] text-[var(--color-text-muted)]">
            Local process monitor
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <div data-tauri-drag-region class="text-right text-[10.5px] tabular-nums text-[var(--color-text-secondary)]">
          <span class="text-[var(--color-teal)]">{props.activeCount}</span> active
          {" · "}
          <span>{props.stoppedCount}</span> stopped
        </div>
        <button
          type="button"
          onClick={props.onSettingsClick}
          class="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
          aria-label="Open settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
