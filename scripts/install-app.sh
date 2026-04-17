#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
APP_DIR="$DATA_HOME/clipboard-history-app"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$DATA_HOME/applications"
AUTOSTART_DIR="$CONFIG_HOME/autostart"

mkdir -p "$APP_DIR" "$BIN_DIR" "$APPS_DIR"
rsync -av --delete "$ROOT_DIR/src" "$ROOT_DIR/data" "$APP_DIR/"

cat >"$BIN_DIR/clipboard-history" <<EOF
#!/usr/bin/env bash
set -euo pipefail
APP_ID="com.elyarestark.ClipboardHistory"
APP_CMD=(gjs -m "$APP_DIR/src/main.js")

app_running() {
  gdbus call --session \
    --dest org.freedesktop.DBus \
    --object-path /org/freedesktop/DBus \
    --method org.freedesktop.DBus.NameHasOwner \
    "\$APP_ID" 2>/dev/null | grep -q "(true,)"
}

daemonize_background() {
  setsid "\${APP_CMD[@]}" --background >/dev/null 2>&1 < /dev/null &
}

case "\${1:-}" in
  --background)
    if ! app_running; then
      daemonize_background
      sleep 0.5
    fi
    exit 0
    ;;
  --toggle)
    if ! app_running; then
      daemonize_background
      sleep 0.7
    fi
    exec "\${APP_CMD[@]}" --toggle
    ;;
  *)
    exec "\${APP_CMD[@]}" "\$@"
    ;;
esac
EOF
chmod +x "$BIN_DIR/clipboard-history"

cp "$ROOT_DIR/data/com.elyarestark.ClipboardHistory.desktop" "$APPS_DIR/com.elyarestark.ClipboardHistory.desktop"

if [[ "${1:-}" == "--autostart" ]]; then
    mkdir -p "$AUTOSTART_DIR"
    cp "$ROOT_DIR/data/com.elyarestark.ClipboardHistory.desktop" "$AUTOSTART_DIR/com.elyarestark.ClipboardHistory.desktop"
    sed -i 's|Exec=clipboard-history --show|Exec=clipboard-history --background|' "$AUTOSTART_DIR/com.elyarestark.ClipboardHistory.desktop"
fi

echo "Installed to $APP_DIR"
echo "Command: $BIN_DIR/clipboard-history"
echo "Desktop entry: $APPS_DIR/com.elyarestark.ClipboardHistory.desktop"
