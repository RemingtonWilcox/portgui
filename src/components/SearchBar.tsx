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
        <input
          ref={inputRef}
          type="text"
          value={props.value}
          onInput={(event) => props.onChange(event.currentTarget.value)}
          placeholder="Filter by name, port, process, or path..."
          class="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 pr-14 text-xs text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-teal-border)]"
        />
        <div class="search-hint absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5">
          {"\u2318K"}
        </div>
      </div>
    </div>
  );
}
