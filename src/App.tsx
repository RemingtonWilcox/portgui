import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Header } from "./components/Header";
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
  listenProcessUpdates,
  pinProcess,
  rebootService,
  restartProcess,
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

type RestartModalState = {
  entry: ServiceEntry;
  restartAfterSave: boolean;
} | null;

function App() {
  const [processes, setProcesses] = createSignal<ServiceEntry[]>([]);
  const [history, setHistory] = createSignal<StoppedEntry[]>([]);
  const [config, setConfig] = createSignal<Config>(defaultConfig());
  const [filter, setFilter] = createSignal("");
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [restartModalState, setRestartModalState] =
    createSignal<RestartModalState>(null);
  const [openMenuServiceId, setOpenMenuServiceId] = createSignal<string | null>(
    null,
  );
  const [toast, setToast] = createSignal<string | null>(null);
  const [hydrated, setHydrated] = createSignal(false);
  const [pendingActions, setPendingActions] = createSignal<
    Record<string, "kill" | "restart">
  >({});

  const filteredProcesses = createMemo(() =>
    processes().filter((entry) => matchesFilter(filter(), entry)),
  );
  const filteredHistory = createMemo(() =>
    history().filter((entry) => matchesFilter(filter(), entry)),
  );
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
      setToast(formatError(error));
      window.setTimeout(() => setToast(null), 5000);
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
    });

    void (async () => {
      try {
        await refresh();
        stopWatchingTheme = watchSystemTheme(
          () => config().preferences.theme,
          () => applyTheme(config().preferences.theme),
        );
      } catch (error) {
        setToast(formatError(error));
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
      <div class="mx-auto flex min-h-screen w-full max-w-[680px] flex-col">
        <Header
          activeCount={processes().length}
          stoppedCount={history().length}
          onSettingsClick={() => setSettingsOpen(true)}
        />

        <SearchBar value={filter()} onChange={setFilter} />

        <div class="flex-1 px-4 pb-5">
          <div class="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
            Active Services
          </div>

          <Show
            when={filteredProcesses().length > 0}
            fallback={
              <div class="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-5 text-[12px] text-[var(--color-text-secondary)]">
                {hydrated()
                  ? "No matching active services."
                  : "Loading current services..."}
              </div>
            }
          >
            <div class="space-y-3">
              <For each={filteredProcesses()}>
                {(entry) => (
                  <ServiceCard
                    entry={entry}
                    menuOpen={openMenuServiceId() === entry.service_id}
                    onMenuOpenChange={(open) =>
                      setOpenMenuServiceId(open ? entry.service_id : null)
                    }
                    pendingAction={pendingActions()[entry.service_id]}
                    onKill={(item) =>
                      runAction(async () => {
                        setPendingActions((current) => ({
                          ...current,
                          [item.service_id]: "kill",
                        }));
                        try {
                          await killProcess(item.pid, item.start_time);
                          queuePendingClear(item.service_id, "kill", 5000);
                        } catch (error) {
                          clearPendingAction(item.service_id);
                          throw error;
                        }
                      })
                    }
                    onRestart={(item) =>
                      runAction(async () => {
                        setPendingActions((current) => ({
                          ...current,
                          [item.service_id]: "restart",
                        }));
                        try {
                          await restartProcess(item.pid, item.start_time);
                          queuePendingClear(item.service_id, "restart", 7000);
                        } catch (error) {
                          clearPendingAction(item.service_id);
                          throw error;
                        }
                      })
                    }
                    onConfigureRestart={(item, restartAfterSave) =>
                      setRestartModalState({ entry: item, restartAfterSave })
                    }
                    onPinToggle={(item) =>
                      runAction(async () => {
                        if (item.is_pinned) {
                          await unpinProcess(item.service_id);
                        } else {
                          await pinProcess(item.pid, item.start_time);
                        }
                        await refresh();
                      })
                    }
                    onHide={(item) =>
                      runAction(async () => {
                        await hideProcess(item.pid, item.start_time);
                        await refresh();
                      })
                    }
                  />
                )}
              </For>
            </div>
          </Show>

          <div class="my-5 border-t border-[var(--color-border)]" />

          <div class="mb-3 flex items-center justify-between">
            <div class="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
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
              <div class="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-5 text-[12px] text-[var(--color-text-secondary)]">
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

      <RestartCommandModal
        entry={restartModalState()?.entry ?? null}
        savedCommand={
          restartModalState()
            ? config().pinned[restartModalState()!.entry.service_id]?.restart_cmd ?? null
            : null
        }
        restartAfterSave={restartModalState()?.restartAfterSave ?? false}
        onClose={() => setRestartModalState(null)}
        onSave={async (entry, command, restartAfterSave) => {
          await runAction(async () => {
            await setRestartCommand(entry.service_id, command);
            setConfig((current) => ({
              ...current,
              pinned: {
                ...current.pinned,
                [entry.service_id]: { restart_cmd: command },
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

      <Show when={toast()}>
        {(message) => (
          <div class="fixed bottom-4 right-4 max-w-md rounded-2xl border border-[var(--color-red-border)] bg-[var(--color-red-bg)] px-4 py-3 text-[12px] text-[var(--color-red)] shadow-[0_20px_40px_rgba(0,0,0,0.2)]">
            {message()}
          </div>
        )}
      </Show>
    </main>
  );
}

export default App;
