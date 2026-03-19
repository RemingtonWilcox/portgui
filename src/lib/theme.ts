import type { Theme } from "./types";

const mediaQuery =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return mediaQuery?.matches ? "dark" : "light";
  }

  return theme;
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = resolveTheme(theme);
}

export function watchSystemTheme(theme: () => Theme, onChange: () => void) {
  if (!mediaQuery) {
    return () => {};
  }

  const handler = () => {
    if (theme() === "system") {
      onChange();
    }
  };

  mediaQuery.addEventListener("change", handler);
  return () => mediaQuery.removeEventListener("change", handler);
}
