# PortGUI

PortGUI is a lightweight macOS desktop app for finding, labeling, and managing local development services.

It watches listening TCP ports on your machine, maps them back to processes, and gives you a simple UI for:

- seeing active dev servers and local infra like Postgres/Redis
- searching by name, port, process, or path
- killing noisy processes quickly
- saving restart commands for the services you care about
- keeping a short local history of recently stopped services

## Why it exists

When you are juggling multiple apps, workers, databases, and one-off local servers, `lsof`, `ps`, and Activity Monitor are enough, but they are not pleasant.

PortGUI is meant to be the fast visual layer on top of that workflow.

## Install

### Download a release

The intended end-user install is:

1. Open the repository's GitHub Releases page
2. Download the latest `.dmg`
3. Drag `PortGUI.app` into `/Applications`
4. Launch it like any other macOS app

If releases are unsigned or not yet notarized, macOS may ask you to right-click the app and choose `Open` the first time.

### Homebrew

Homebrew installation is not set up in this repo yet.

Once a cask or tap exists, the README can be updated with a one-line install command such as:

```bash
brew install --cask portgui
```

or:

```bash
brew install <your-tap>/portgui
```

Until then, use the DMG from GitHub Releases.

## Build From Source

Requirements:

- macOS
- `pnpm`
- Rust via `rustup`
- Xcode Command Line Tools

Install dependencies and run in development:

```bash
pnpm install
pnpm tauri dev
```

Build a debug app bundle:

```bash
pnpm tauri build --debug
```

Refresh the locally installed `/Applications/PortGUI.app` during development:

```bash
pnpm app:refresh
```

## How it works

PortGUI is not tied to any specific workspace folder like `Documents`.

It works by:

1. enumerating listening TCP sockets on your machine
2. mapping those sockets back to owning PIDs
3. reading process metadata like command and current working directory
4. looking for project markers near that working directory, such as `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `Gemfile`, `pom.xml`, or `build.gradle`
5. applying lightweight heuristics to decide which listeners are likely to be development-related

That means it can work with projects anywhere on disk, as long as the process exposes enough local metadata to classify it.

## Privacy And Safety

PortGUI is designed to be local-first.

- It does not send your process list to a server.
- It does not collect telemetry or analytics.
- It does not capture keystrokes.
- It stores only local app state such as pinned services, hidden services, preferences, and recently stopped entries.

Local files are stored under:

```text
~/Library/Application Support/com.portgui.desktop/
```

If you want to inspect what the app stores, the data is plain JSON.

## What PortGUI Can And Cannot Do

PortGUI can always kill a process by PID.

Restart is different: PortGUI cannot safely infer the exact command that originally launched every process, so restart commands are explicit. You save the command once, and after that PortGUI can rerun it from the correct working directory.

That keeps restart behavior predictable instead of guessing wrong.

## Development Notes

- Frontend: SolidJS + Tailwind CSS v4 + Vite
- Desktop shell: Tauri 2
- Process metadata: `sysinfo`
- Socket-to-PID mapping: `netstat2`
- Persistence: local JSON files with atomic writes

Useful commands:

```bash
pnpm build
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml --lib
```

## Roadmap

- signed and notarized macOS releases
- GitHub Releases publishing flow
- Homebrew cask/tap installation
- broader process classification tuning

## License

[MIT](./LICENSE)
