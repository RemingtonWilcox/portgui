# PortGUI

A small macOS desktop app for monitoring and managing dev processes, ports, and servers in real time.

Built with Tauri 2, SolidJS, Tailwind CSS v4, and Rust.

## Install

**Homebrew:**

```bash
brew install --cask RemingtonWilcox/tap/portgui
```

**Direct download:** grab the `.dmg` from [GitHub Releases](https://github.com/RemingtonWilcox/portgui/releases/latest).

The published app is signed and notarized by Apple, so it opens without the usual Gatekeeper warning.

## What it does

PortGUI scans your machine every 1.5 seconds for dev-related processes listening on TCP ports. It shows them in a clean dashboard where you can:

- **See** active dev servers, databases, and tools at a glance
- **Kill** any process with one click (SIGTERM, then SIGKILL if needed)
- **Restart** services with saved commands — no terminal required
- **Reboot** recently stopped services from history
- **Pin** important services so they always appear
- **Hide** noise you don't care about
- **Search** by name, port, process, or path (Cmd+K)

## How it works

1. Enumerates listening TCP sockets via `netstat2` (native macOS libproc syscalls)
2. Maps sockets to processes and reads metadata (name, command, cwd, uptime) via `sysinfo`
3. Looks for project markers (`package.json`, `Cargo.toml`, `go.mod`, etc.) near the working directory
4. Applies heuristics to filter dev-related processes from system noise
5. Pushes the full state to the UI every scan cycle — only when something changes

Works with projects anywhere on disk. Not tied to any specific folder.

## Features

- **Smart classification** — dev tools (vite, next, wrangler) always show; generic runtimes (node, python) require project signals; known desktop apps (Discord, Slack) are filtered out
- **Intelligent naming** — reads `package.json` name, detects monorepo structures, maps known commands to friendly names
- **Restart commands** — user-approved, not guessed from `cmd()`. Runs via `/bin/zsh -il` so Homebrew, nvm, asdf, and pnpm all work
- **Persistent history** — recently stopped services survive app restarts, with one-click reboot
- **Light & Dark mode** — warm stone + teal theme, follows system preference
- **macOS vibrancy** — frosted glass native feel
- **Cmd+K search** — filter across all services instantly

## Privacy

- No network requests. No telemetry. No analytics.
- No keystroke capture.
- Stores only local app state (pinned/hidden services, preferences, history) as plain JSON in:

```
~/Library/Application Support/com.portgui.desktop/
```

## Build from source

Requires macOS, pnpm, Rust (via rustup), and Xcode Command Line Tools.

```bash
pnpm install
pnpm tauri dev
```

Release build:

```bash
pnpm tauri build
```

Run tests:

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml --lib
```

## Tech stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri 2.10 |
| Frontend | SolidJS 1.9 |
| Styling | Tailwind CSS v4 |
| Build | Vite |
| Process info | sysinfo (Rust) |
| Port mapping | netstat2 (Rust) |
| Persistence | JSON files with atomic writes |

## Requirements

- macOS Monterey or later
- Apple Silicon (arm64)

## License

[MIT](./LICENSE)
