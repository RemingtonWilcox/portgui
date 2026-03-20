import { onCleanup, onMount } from "solid-js";

export function SearchBar(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef) {
        props.onChange("");
        inputRef?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  return (
    <div class="px-4 py-3">
      <div class="relative">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={props.value}
          onInput={(event) => props.onChange(event.currentTarget.value)}
          placeholder="Filter by name, port, process, or path..."
          class="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] py-2 pl-9 pr-14 text-xs text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-teal-border)]"
        />
        <div class="search-hint absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5">
          {"\u2318K"}
        </div>
      </div>
    </div>
  );
}
