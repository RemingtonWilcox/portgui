#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUSTUP_BIN="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin"
BUILD_APP="$ROOT_DIR/src-tauri/target/debug/bundle/macos/PortGUI.app"
INSTALLED_APP="/Applications/PortGUI.app"
TEMP_APP="/Applications/PortGUI.app.__new__"

export PATH="$RUSTUP_BIN:$PATH"
export RUSTC="$RUSTUP_BIN/rustc"
export RUSTDOC="$RUSTUP_BIN/rustdoc"

cd "$ROOT_DIR"

echo "Quitting any running PortGUI instance..."
osascript -e 'tell application "PortGUI" to quit' >/dev/null 2>&1 || true
sleep 1
pkill -x portgui >/dev/null 2>&1 || true

echo "Building latest debug app..."
pnpm tauri build --debug

TARGET_APP="$BUILD_APP"

if [ -d "/Applications" ] && { [ -w "/Applications" ] || [ -d "$INSTALLED_APP" -a -w "$INSTALLED_APP" ]; }; then
  echo "Updating /Applications/PortGUI.app..."
  rm -rf "$TEMP_APP"
  ditto "$BUILD_APP" "$TEMP_APP"
  rm -rf "$INSTALLED_APP"
  mv "$TEMP_APP" "$INSTALLED_APP"
  TARGET_APP="$INSTALLED_APP"
fi

echo "Opening $TARGET_APP"
open "$TARGET_APP"
