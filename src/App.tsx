import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Header } from "./components/Header";
import { RenameFavoriteModal } from "./components/RenameFavoriteModal";
import { RestartCommandModal } from "./components/RestartCommandModal";
import { SearchBar } from "./components/SearchBar";
import { ServiceCard } from "./components/ServiceCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { StoppedCard } from "./components/StoppedCard";
import {
  clearHistory,
  hideProcess,
  hydrateState,
  killProcess,
  launchPinnedService,
  listenProcessUpdates,
  pinProcess,
  rebootService,
  restartProcess,
  setCustomName,
  setRestartCommand,
  unhideProcess,
  unpinProcess,
  updatePreferences,
} from "./lib/tauri";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import type {
  Config,
  ServiceEntry,
  StoppedEntry,
  Theme,
} from "./lib/types";
import { defaultConfig } from "./lib/types";

function mergeStoppedEntries(
  existing: StoppedEntry[],
  incoming: StoppedEntry[],
): StoppedEntry[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values()).sort((left, right) =>
    right.stopped_at.localeCompare(left.stopped_at),
  );
}

function matchesFilter(query: string, entry: ServiceEntry | StoppedEntry) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    entry.display_name,
    entry.process_name,
    entry.cwd ?? "",
    "ports" in entry ? entry.ports.join(" ") : String(entry.primary_port),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function formatError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

type FavoriteItem = {
  favorite_id: string;
  display_name: string;
  process_name: string | null;
  cwd: string | null;
  primary_port: number | null;
  restart_cmd: string | null;
  active_entry: ServiceEntry | null;
};

function matchesFavoriteFilter(query: string, entry: FavoriteItem) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    entry.display_name,
    entry.process_name ?? "",
    entry.cwd ?? "",
    entry.primary_port ?? "",
    entry.active_entry?.ports.join(" ") ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

type RestartModalState = {
  entry: ServiceEntry;
  restartAfterSave: boolean;
} | null;

type RenameModalState = {
  favoriteId: string;
  currentName: string | null;
  fallbackName: string;
} | null;

type ToastMessage = { message: string; variant: "error" | "success" };

type FavoritePendingAction = "starting" | "stopping" | "restarting";
type FavoriteBatchState = {
  action: FavoritePendingAction;
  count: number;
} | null;

function App() {
  const [processes, setProcesses] = createSignal<ServiceEntry[]>([]);
  const [history, setHistory] = createSignal<StoppedEntry[]>([]);
  const [config, setConfig] = createSignal<Config>(defaultConfig());
  const [filter, setFilter] = createSignal("");
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [showOtherListeners, setShowOtherListeners] = createSignal(false);
  const [restartModalState, setRestartModalState] =
    createSignal<RestartModalState>(null);
  const [renameModalState, setRenameModalState] =
    createSignal<RenameModalState>(null);
  const [openMenuServiceId, setOpenMenuServiceId] = createSignal<string | null>(
    null,
  );
  const [toast, setToast] = createSignal<ToastMessage | null>(null);
  const [hydrated, setHydrated] = createSignal(false);
  const [pendingActions, setPendingActions] = createSignal<
    Record<string, "kill" | "restart">
  >({});
  const [favoritePendingActions, setFavoritePendingActions] = createSignal<
    Record<string, FavoritePendingAction>
  >({});
  const [favoriteBatchState, setFavoriteBatchState] =
    createSignal<FavoriteBatchState>(null);

  const filteredPrimaryProcesses = createMemo(() =>
    processes().filter((entry) =>
      entry.is_classified && !entry.is_pinned && matchesFilter(filter(), entry),
    ),
  );
  const filteredOtherProcesses = createMemo(() =>
    processes().filter((entry) =>
      !entry.is_classified && !entry.is_pinned && matchesFilter(filter(), entry),
    ),
  );
  const otherListeners = createMemo(() =>
    processes().filter((entry) => !entry.is_classified && !entry.is_pinned),
  );
  const favoriteItems = createMemo<FavoriteItem[]>(() => {
    const activeByFavoriteId = new Map(
      processes().map((entry) => [entry.favorite_id, entry] as const),
    );

    return Object.entries(config().pinned)
      .map(([favorite_id, favorite]) => {
        const active_entry = activeByFavoriteId.get(favorite_id) ?? null;
        return {
          favorite_id,
          display_name:
            config().custom_names[favorite_id] ??
            active_entry?.display_name ??
            favorite.display_name ??
            favorite.cwd?.split("/").filter(Boolean).pop() ??
            favorite.process_name ??
            "Favorite Service",
          process_name: active_entry?.process_name ?? favorite.process_name,
          cwd: active_entry?.cwd ?? favorite.cwd,
          primary_port:
            active_entry?.ports[0] ?? favorite.primary_port ?? null,
          restart_cmd: favorite.restart_cmd,
          active_entry,
        };
      })
      .sort((left, right) => {
        const leftActive = left.active_entry !== null;
        const rightActive = right.active_entry !== null;
        return (
          Number(rightActive) - Number(leftActive) ||
          left.display_name.localeCompare(right.display_name)
        );
      });
  });
  const filteredFavoriteItems = createMemo(() =>
    favoriteItems().filter((entry) => matchesFavoriteFilter(filter(), entry)),
  );
  const runningFavoriteCount = createMemo(() =>
    favoriteItems().filter((entry) => entry.active_entry !== null).length,
  );
  const stoppedFavoriteCount = createMemo(() =>
    favoriteItems().filter((entry) => entry.active_entry === null).length,
  );
  const startableFavoriteCount = createMemo(() =>
    favoriteItems().filter(
      (entry) => entry.active_entry === null && !!entry.restart_cmd,
    ).length,
  );
  const filteredHistory = createMemo(() =>
    history().filter((entry) => matchesFilter(filter(), entry)),
  );
  const showToast = (message: string, variant: "error" | "success" = "error") => {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 5000);
  };
  const clearPendingAction = (serviceId: string) => {
    setPendingActions((current) => {
      if (!(serviceId in current)) return current;
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
  };
  const queuePendingClear = (
    serviceId: string,
    action: "kill" | "restart",
    delayMs: number,
  ) => {
    window.setTimeout(() => {
      setPendingActions((current) => {
        if (current[serviceId] !== action) return current;
        const next = { ...current };
        delete next[serviceId];
        return next;
      });
    }, delayMs);
  };
  const clearFavoritePendingAction = (favoriteId: string) => {
    setFavoritePendingActions((current) => {
      if (!(favoriteId in current)) return current;
      const next = { ...current };
      delete next[favoriteId];
      return next;
    });
  };
  const queueFavoritePendingClear = (
    favoriteId: string,
    action: FavoritePendingAction,
    delayMs: number,
  ) => {
    window.setTimeout(() => {
      setFavoritePendingActions((current) => {
        if (current[favoriteId] !== action) return current;
        const next = { ...current };
        delete next[favoriteId];
        return next;
      });
    }, delayMs);
  };
  const waitForNextPaint = () =>
    new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  const markFavoriteBatchPending = (
    items: FavoriteItem[],
    action: FavoritePendingAction,
  ) => {
    setFavoritePendingActions((current) => {
      const next = { ...current };
      for (const item of items) {
        next[item.favorite_id] = action;
      }
      return next;
    });
  };

  const refresh = async () => {
    const snapshot = await hydrateState();
    setProcesses(snapshot.active);
    setHistory(snapshot.history);
    setConfig(snapshot.config);
    applyTheme(snapshot.config.preferences.theme);
    setPendingActions((current) => {
      const next = { ...current };
      const activeIds = new Set(snapshot.active.map((entry) => entry.service_id));
      for (const [serviceId, action] of Object.entries(next)) {
        if (action === "kill" && !activeIds.has(serviceId)) {
          delete next[serviceId];
        }
        if (action === "restart" && activeIds.has(serviceId)) {
          delete next[serviceId];
        }
      }
      return next;
    });
    setFavoritePendingActions((current) => {
      const next = { ...current };
      const activeFavoriteIds = new Set(
        snapshot.active.map((entry) => entry.favorite_id),
      );
      for (const [favoriteId, action] of Object.entries(next)) {
        if (action === "starting" && activeFavoriteIds.has(favoriteId)) {
          delete next[favoriteId];
        }
        if (action === "stopping" && !activeFavoriteIds.has(favoriteId)) {
          delete next[favoriteId];
        }
        if (action === "restarting" && activeFavoriteIds.has(favoriteId)) {
          delete next[favoriteId];
        }
      }
      return next;
    });
    if (
      openMenuServiceId() &&
      !snapshot.active.some((entry) => entry.service_id === openMenuServiceId())
    ) {
      setOpenMenuServiceId(null);
    }
    setHydrated(true);
  };

  const runAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      showToast(formatError(error));
    }
  };

  const stopService = async (entry: ServiceEntry) => {
    setPendingActions((current) => ({
      ...current,
      [entry.service_id]: "kill",
    }));
    try {
      await killProcess(entry.pid, entry.start_time);
      queuePendingClear(entry.service_id, "kill", 5000);
    } catch (error) {
      clearPendingAction(entry.service_id);
      throw error;
    }
  };

  const restartService = async (entry: ServiceEntry) => {
    setPendingActions((current) => ({
      ...current,
      [entry.service_id]: "restart",
    }));
    try {
      await restartProcess(entry.pid, entry.start_time);
      queuePendingClear(entry.service_id, "restart", 7000);
    } catch (error) {
      clearPendingAction(entry.service_id);
      throw error;
    }
  };

  const toggleFavorite = async (entry: ServiceEntry) => {
    if (entry.is_pinned) {
      await unpinProcess(entry.favorite_id);
    } else {
      await pinProcess(entry.pid, entry.start_time);
    }
    await refresh();
  };

  const hideServiceEntry = async (entry: ServiceEntry) => {
    await hideProcess(entry.pid, entry.start_time);
    await refresh();
  };

  const startFavorite = async (
    item: FavoriteItem,
    options?: { premarked?: boolean },
  ) => {
    if (!options?.premarked) {
      setFavoritePendingActions((current) => ({
        ...current,
        [item.favorite_id]: "starting",
      }));
    }
    try {
      await launchPinnedService(item.favorite_id);
      queueFavoritePendingClear(item.favorite_id, "starting", 7000);
    } catch (error) {
      clearFavoritePendingAction(item.favorite_id);
      throw error;
    }
  };

  const stopFavorite = async (
    item: FavoriteItem,
    options?: { premarked?: boolean },
  ) => {
    const active = item.active_entry;
    if (!active) return;

    if (!options?.premarked) {
      setFavoritePendingActions((current) => ({
        ...current,
        [item.favorite_id]: "stopping",
      }));
    }
    try {
      await stopService(active);
      queueFavoritePendingClear(item.favorite_id, "stopping", 5000);
    } catch (error) {
      clearFavoritePendingAction(item.favorite_id);
      throw error;
    }
  };

  const restartFavorite = async (
    item: FavoriteItem,
    options?: { premarked?: boolean },
  ) => {
    const active = item.active_entry;
    if (!active) return;

    if (!options?.premarked) {
      setFavoritePendingActions((current) => ({
        ...current,
        [item.favorite_id]: "restarting",
      }));
    }
    try {
      await restartService(active);
      queueFavoritePendingClear(item.favorite_id, "restarting", 7000);
    } catch (error) {
      clearFavoritePendingAction(item.favorite_id);
      throw error;
    }
  };

  const removeFavorite = async (item: FavoriteItem) => {
    await unpinProcess(item.favorite_id);
    await refresh();
  };

  const openRenameFavoriteModal = (
    favoriteId: string,
    currentName: string | null,
    fallbackName: string,
  ) => {
    setRenameModalState({
      favoriteId,
      currentName,
      fallbackName,
    });
  };

  const openRenameFromFavoriteItem = (item: FavoriteItem) => {
    openRenameFavoriteModal(
      item.favorite_id,
      config().custom_names[item.favorite_id] ?? null,
      item.active_entry?.auto_display_name ??
        config().pinned[item.favorite_id]?.display_name ??
        item.display_name,
    );
  };

  const openRenameFromServiceEntry = (entry: ServiceEntry) => {
    const pinned = config().pinned[entry.favorite_id];
    openRenameFavoriteModal(
      entry.favorite_id,
      config().custom_names[entry.favorite_id] ?? null,
      pinned?.display_name ?? entry.auto_display_name,
    );
  };

  const runFavoriteBatch = async (
    items: FavoriteItem[],
    action: (item: FavoriteItem, options?: { premarked?: boolean }) => Promise<void>,
    pendingAction: FavoritePendingAction,
    label: string,
  ) => {
    if (items.length === 0) return;

    markFavoriteBatchPending(items, pendingAction);
    setFavoriteBatchState({
      action: pendingAction,
      count: items.length,
    });

    // Paint the optimistic busy state before crossing the Tauri bridge.
    await waitForNextPaint();

    const results = await Promise.allSettled(
      items.map(async (item) => {
        await action(item, { premarked: true });
        return item.display_name;
      }),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    await refresh();
    setFavoriteBatchState(null);
    if (failures.length > 0) {
      showToast(
        `${label} finished with ${failures.length} error${failures.length === 1 ? "" : "s"}.`,
      );
    }
  };

  onMount(() => {
    let disposed = false;
    let stopWatchingTheme = () => {};
    let unlistenPromise: Promise<() => void> | null = null;

    unlistenPromise = listenProcessUpdates((payload) => {
      setProcesses(payload.active);
      setHistory((current) => mergeStoppedEntries(current, payload.newly_stopped));
      if (
        openMenuServiceId() &&
        !payload.active.some((entry) => entry.service_id === openMenuServiceId())
      ) {
        setOpenMenuServiceId(null);
      }
      setPendingActions((current) => {
        const next = { ...current };
        const activeIds = new Set(payload.active.map((entry) => entry.service_id));
        for (const [serviceId, action] of Object.entries(next)) {
          if (action === "kill" && !activeIds.has(serviceId)) {
            delete next[serviceId];
          }
          if (action === "restart" && activeIds.has(serviceId)) {
            delete next[serviceId];
          }
        }
        return next;
      });
      setFavoritePendingActions((current) => {
        const next = { ...current };
        const activeFavoriteIds = new Set(
          payload.active.map((entry) => entry.favorite_id),
        );
        for (const [favoriteId, action] of Object.entries(next)) {
          if (action === "starting" && activeFavoriteIds.has(favoriteId)) {
            delete next[favoriteId];
          }
          if (action === "stopping" && !activeFavoriteIds.has(favoriteId)) {
            delete next[favoriteId];
          }
          if (action === "restarting" && activeFavoriteIds.has(favoriteId)) {
            delete next[favoriteId];
          }
        }
        return next;
      });
    });

    void (async () => {
      try {
        await refresh();
        stopWatchingTheme = watchSystemTheme(
          () => config().preferences.theme,
          () => applyTheme(config().preferences.theme),
        );
      } catch (error) {
        showToast(formatError(error));
      }
    })();

    onCleanup(() => {
      disposed = true;
      stopWatchingTheme();
      if (unlistenPromise) {
        void unlistenPromise.then((unlisten) => {
          if (!disposed) return;
          unlisten();
        });
      }
    });
  });

  return (
    <main class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div class="relative mx-auto flex min-h-screen w-full max-w-[680px] flex-col">
        <Header
          activeCount={processes().length}
          stoppedCount={history().length}
          onSettingsClick={() => setSettingsOpen(true)}
        />

        <SettingsPanel
          config={config()}
          open={settingsOpen()}
          onClose={() => setSettingsOpen(false)}
          onThemeChange={(theme: Theme) =>
            runAction(async () => {
              const nextConfig = {
                ...config(),
                preferences: {
                  ...config().preferences,
                  theme,
                },
              };
              await updatePreferences(nextConfig.preferences);
              setConfig(nextConfig);
              applyTheme(theme);
            })
          }
          onPollChange={(pollMs) =>
            runAction(async () => {
              const nextConfig = {
                ...config(),
                preferences: {
                  ...config().preferences,
                  poll_interval_ms: pollMs,
                },
              };
              await updatePreferences(nextConfig.preferences);
              setConfig(nextConfig);
            })
          }
          onUnhide={(serviceId) =>
            runAction(async () => {
              await unhideProcess(serviceId);
              await refresh();
            })
          }
        />

        <SearchBar value={filter()} onChange={setFilter} />

        <div class="flex-1 px-4 pb-5">
          <Show when={favoriteItems().length > 0}>
            <div class="mb-5">
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-baseline gap-2">
                  <span class="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-teal)]">
                    Favorites
                  </span>
                  <span class="text-[10px] text-[var(--color-text-muted)]">
                    {runningFavoriteCount()} running · {stoppedFavoriteCount()} stopped
                  </span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={
                      startableFavoriteCount() === 0 ||
                      favoriteBatchState() !== null
                    }
                    onClick={() =>
                      runAction(() =>
                        runFavoriteBatch(
                          favoriteItems().filter(
                            (item) => item.active_entry === null && !!item.restart_cmd,
                          ),
                          startFavorite,
                          "starting",
                          "Start all favorites",
                        ),
                      )
                    }
                    class="flex items-center gap-1 rounded-lg border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-teal)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Show when={favoriteBatchState()?.action === "starting"}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="spinner">
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                    </Show>
                    {favoriteBatchState()?.action === "starting"
                      ? "Starting..."
                      : "Start all"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      runningFavoriteCount() === 0 ||
                      favoriteBatchState() !== null
                    }
                    onClick={() =>
                      runAction(() =>
                        runFavoriteBatch(
                          favoriteItems().filter((item) => item.active_entry !== null),
                          stopFavorite,
                          "stopping",
                          "Stop all favorites",
                        ),
                      )
                    }
                    class="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-button-neutral)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-button-neutral-text)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Show when={favoriteBatchState()?.action === "stopping"}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="spinner">
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                    </Show>
                    {favoriteBatchState()?.action === "stopping"
                      ? "Stopping..."
                      : "Stop all"}
                  </button>
                </div>
              </div>

              <Show
                when={filteredFavoriteItems().length > 0}
                fallback={
                  <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-4 text-center text-[11px] text-[var(--color-text-secondary)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="opacity-40">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    No matching favorites.
                  </div>
                }
              >
                <div class="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
                  <For each={filteredFavoriteItems()}>
                    {(item, index) => {
                      const isActive = () => item.active_entry !== null;
                      const busyState = () => favoritePendingActions()[item.favorite_id];
                      const isBusy = () => busyState() !== undefined;
                      const port = () =>
                        isActive()
                          ? item.active_entry!.ports[0] ?? null
                          : item.primary_port;

                      return (
                        <div
                          class="flex items-center gap-3 px-3 py-2 transition-colors"
                          classList={{
                            "border-t border-[var(--color-border)]": index() > 0,
                            "bg-[var(--color-teal-bg)]": isBusy(),
                            "hover:bg-[var(--color-bg-solid)]/40": !isBusy(),
                          }}
                        >
                          <span
                            class="h-1.5 w-1.5 shrink-0 rounded-full"
                            classList={{
                              "bg-[var(--color-teal)] dot-glow-teal": isActive() && !isBusy(),
                              "bg-[var(--color-teal)] dot-pulse": isBusy(),
                              "bg-[var(--color-text-secondary)]": !isActive() && !isBusy(),
                            }}
                          />
                          <span
                            class="min-w-0 flex-1 cursor-text truncate text-[12px] font-medium text-[var(--color-text)]"
                            onDblClick={() => openRenameFromFavoriteItem(item)}
                            title="Double-click to rename"
                          >
                            {item.display_name}
                          </span>
                          <Show when={port()}>
                            <span class="text-[10px] tabular-nums text-[var(--color-text-muted)]">
                              :{port()}
                            </span>
                          </Show>
                          <Show when={!item.restart_cmd && !isActive()}>
                            <span class="text-[10px] text-[var(--color-amber)]">
                              no cmd
                            </span>
                          </Show>
                          <div class="flex shrink-0 items-center gap-1">
                            <Show when={isActive()}>
                              <button
                                type="button"
                                disabled={isBusy()}
                                onClick={() => runAction(() => stopFavorite(item))}
                                class="flex items-center gap-1 rounded-md border border-[var(--color-button-neutral-border)] bg-[var(--color-button-neutral)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-button-neutral-text)] transition-colors hover:border-[var(--color-red-border)] hover:bg-[var(--color-red-bg)] hover:text-[var(--color-red)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Show when={busyState() === "stopping"}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="spinner">
                                    <path d="M12 2a10 10 0 0 1 10 10" />
                                  </svg>
                                </Show>
                                {busyState() === "stopping" ? "Stopping" : "Stop"}
                              </button>
                              <Show when={item.restart_cmd}>
                                <button
                                  type="button"
                                  disabled={isBusy()}
                                  onClick={() =>
                                    runAction(() => restartFavorite(item))
                                  }
                                  class="flex items-center gap-1 rounded-md border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-teal)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Show when={busyState() === "restarting"}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="spinner">
                                      <path d="M12 2a10 10 0 0 1 10 10" />
                                    </svg>
                                  </Show>
                                  {busyState() === "restarting" ? "Restarting" : "Restart"}
                                </button>
                              </Show>
                            </Show>
                            <Show when={!isActive()}>
                              <button
                                type="button"
                                disabled={isBusy() || !item.restart_cmd}
                                onClick={() =>
                                  runAction(() => startFavorite(item))
                                }
                                class="flex items-center gap-1 rounded-md border border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-teal)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Show when={busyState() === "starting"}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="spinner">
                                    <path d="M12 2a10 10 0 0 1 10 10" />
                                  </svg>
                                </Show>
                                {busyState() === "starting" ? "Starting" : "Start"}
                              </button>
                            </Show>
                            <button
                              type="button"
                              disabled={isBusy()}
                              onClick={() =>
                                runAction(() => removeFavorite(item))
                              }
                              class="ml-0.5 flex items-center justify-center rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-red)] disabled:cursor-not-allowed disabled:opacity-60"
                              title="Remove from favorites"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          <div class="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-blue)]">
            Active Services
          </div>

          <Show
            when={filteredPrimaryProcesses().length > 0}
            fallback={
              <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-5 text-center text-[12px] text-[var(--color-text-secondary)]">
                <Show when={hydrated()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="opacity-40">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </Show>
                {hydrated()
                  ? "No matching active services."
                  : "Loading current services..."}
              </div>
            }
          >
            <div class="space-y-3">
              <For each={filteredPrimaryProcesses()}>
                {(entry) => (
                  <ServiceCard
                    entry={entry}
                    menuOpen={openMenuServiceId() === entry.service_id}
                    onMenuOpenChange={(open) =>
                      setOpenMenuServiceId(open ? entry.service_id : null)
                    }
                    pendingAction={pendingActions()[entry.service_id]}
                    onKill={(item) => runAction(() => stopService(item))}
                    onRestart={(item) => runAction(() => restartService(item))}
                    onConfigureRestart={(item, restartAfterSave) =>
                      setRestartModalState({ entry: item, restartAfterSave })
                    }
                    onRename={(item) => openRenameFromServiceEntry(item)}
                    onPinToggle={(item) => runAction(() => toggleFavorite(item))}
                    onHide={(item) => runAction(() => hideServiceEntry(item))}
                  />
                )}
              </For>
            </div>
          </Show>

          <Show when={otherListeners().length > 0}>
            <div class="mt-5">
              <button
                type="button"
                onClick={() => setShowOtherListeners((current) => !current)}
                class="mb-3 flex items-center gap-2"
              >
                <span class="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                  Other Processes
                </span>
                <span class="text-[10px] tabular-nums text-[var(--color-text-muted)]">
                  {otherListeners().length}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-[var(--color-text-muted)] transition-transform"
                  classList={{
                    "rotate-180": showOtherListeners() || filter().length > 0,
                  }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              <Show when={showOtherListeners() || filter().length > 0}>
                <div class="section-expand">
                <Show
                  when={filteredOtherProcesses().length > 0}
                  fallback={
                    <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-5 text-center text-[12px] text-[var(--color-text-secondary)]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="opacity-40">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      No matching processes.
                    </div>
                  }
                >
                  <div class="space-y-3">
                    <For each={filteredOtherProcesses()}>
                      {(entry) => (
                        <ServiceCard
                          entry={entry}
                          menuOpen={openMenuServiceId() === entry.service_id}
                          onMenuOpenChange={(open) =>
                            setOpenMenuServiceId(open ? entry.service_id : null)
                          }
                          pendingAction={pendingActions()[entry.service_id]}
                          onKill={(item) => runAction(() => stopService(item))}
                          onRestart={(item) => runAction(() => restartService(item))}
                          onConfigureRestart={(item, restartAfterSave) =>
                            setRestartModalState({ entry: item, restartAfterSave })
                          }
                          onRename={(item) => openRenameFromServiceEntry(item)}
                          onPinToggle={(item) => runAction(() => toggleFavorite(item))}
                          onHide={(item) => runAction(() => hideServiceEntry(item))}
                        />
                      )}
                    </For>
                  </div>
                </Show>
                </div>
              </Show>
            </div>
          </Show>

          <div class="my-5 border-t border-[var(--color-border)]" />

          <div class="mb-3 flex items-center justify-between">
            <div class="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-amber)]">
              Recently Stopped
            </div>
            <button
              type="button"
              onClick={() =>
                runAction(async () => {
                  await clearHistory();
                  setHistory([]);
                })
              }
              class="text-[10px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-teal)]"
            >
              Clear all
            </button>
          </div>

          <Show
            when={filteredHistory().length > 0}
            fallback={
              <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-5 text-center text-[12px] text-[var(--color-text-secondary)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="opacity-40">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                No matching stopped services.
              </div>
            }
          >
            <div class="space-y-3">
              <For each={filteredHistory()}>
                {(entry) => (
                  <StoppedCard
                    entry={entry}
                    onReboot={(item) => runAction(() => rebootService(item.id))}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <RestartCommandModal
        entry={restartModalState()?.entry ?? null}
        savedCommand={
          restartModalState()
            ? config().pinned[restartModalState()!.entry.favorite_id]?.restart_cmd ?? null
            : null
        }
        restartAfterSave={restartModalState()?.restartAfterSave ?? false}
        onClose={() => setRestartModalState(null)}
        onSave={async (entry, command, restartAfterSave) => {
          await runAction(async () => {
            await setRestartCommand(entry.favorite_id, command);
            setConfig((current) => ({
              ...current,
              pinned: {
                ...current.pinned,
                [entry.favorite_id]: {
                  restart_cmd: command,
                  display_name:
                    current.pinned[entry.favorite_id]?.display_name ??
                    entry.auto_display_name,
                  process_name:
                    current.pinned[entry.favorite_id]?.process_name ?? entry.process_name,
                  cwd: current.pinned[entry.favorite_id]?.cwd ?? entry.cwd,
                  primary_port:
                    current.pinned[entry.favorite_id]?.primary_port ??
                    entry.ports[0] ??
                    null,
                },
              },
            }));
            setRestartModalState(null);
            if (restartAfterSave) {
              setPendingActions((current) => ({
                ...current,
                [entry.service_id]: "restart",
              }));
              try {
                await restartProcess(entry.pid, entry.start_time);
                queuePendingClear(entry.service_id, "restart", 7000);
              } catch (error) {
                clearPendingAction(entry.service_id);
                throw error;
              }
            }
            await refresh();
          });
        }}
      />

      <RenameFavoriteModal
        open={renameModalState() !== null}
        currentName={renameModalState()?.currentName ?? null}
        fallbackName={renameModalState()?.fallbackName ?? "Favorite Service"}
        onClose={() => setRenameModalState(null)}
        onSave={async (name) => {
          const modal = renameModalState();
          if (!modal) return;
          await runAction(async () => {
            await setCustomName(modal.favoriteId, name);
            setConfig((current) => ({
              ...current,
              custom_names: name.trim()
                ? {
                    ...current.custom_names,
                    [modal.favoriteId]: name.trim(),
                  }
                : Object.fromEntries(
                    Object.entries(current.custom_names).filter(
                      ([favoriteId]) => favoriteId !== modal.favoriteId,
                    ),
                  ),
            }));
            setRenameModalState(null);
            await refresh();
          });
        }}
      />

      <Show when={toast()}>
        {(t) => (
          <div
            class="toast-animate fixed bottom-4 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3 text-[12px] shadow-[0_20px_40px_rgba(0,0,0,0.2)]"
            classList={{
              "border-[var(--color-red-border)] bg-[var(--color-red-bg)] text-[var(--color-red)]":
                t().variant === "error",
              "border-[var(--color-teal-border)] bg-[var(--color-teal-bg)] text-[var(--color-teal)]":
                t().variant === "success",
            }}
          >
            <span class="flex-1">{t().message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              class="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </Show>
    </main>
  );
}

export default App;
