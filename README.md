# Clipboard History for Ubuntu GNOME

The recommended build for this repository is now a native `GTK4/libadwaita` application written in `GJS`, designed for Ubuntu 24.04 GNOME. It runs as a background app, captures clipboard history, and can be opened with a GNOME custom shortcut that launches `clipboard-history --toggle`.

The old GNOME Shell extension files are still in the repository as legacy experiments, but the supported path is the app in `src/`.

## Architecture

- `src/main.js`: entry point.
- `src/application.js`: `Adw.Application`, command-line actions and background lifecycle.
- `src/services/storage.js`: JSON config and history persistence.
- `src/services/historyManager.js`: in-memory model, filters, deduplication, pin/delete and restore-to-clipboard.
- `src/services/clipboardService.js`: background clipboard polling for text and images.
- `src/ui/mainWindow.js`: main window, search, actions, preferences dialog and toast feedback.
- `src/ui/historyRow.js`: per-item row widget for text and image entries.
- `data/clipboard-history.css`: application styling.
- `bin/clipboard-history`: local wrapper to run the app directly from the repository.
- `scripts/install-app.sh`: installs the app to `~/.local`.

## File Structure

```text
clipboard-ubuntu/
├── bin/
│   └── clipboard-history
├── data/
│   ├── clipboard-history.css
│   └── com.elyarestark.ClipboardHistory.desktop
├── scripts/
│   ├── install-app.sh
│   └── package.sh
├── src/
│   ├── application.js
│   ├── config.js
│   ├── main.js
│   ├── utils.js
│   ├── services/
│   │   ├── clipboardService.js
│   │   ├── historyManager.js
│   │   └── storage.js
│   └── ui/
│       ├── historyRow.js
│       └── mainWindow.js
└── legacy extension files...
```

## Features in the App Build

- Background clipboard monitor using GTK4/GDK.
- Floating-ish GTK window that is much easier to debug and refine than a shell extension.
- Text history with search, pin, delete and clear.
- Best-effort image history using `Gdk.Texture`.
- JSON persistence across restarts.
- Consecutive duplicate suppression.
- Basic sensitive-text filtering and configurable exclusions.
- Pause/resume capture.
- Session-only mode.
- In-app preferences dialog.

## Local Run

Run directly from the repository:

```bash
cd repo-git
chmod +x bin/clipboard-history scripts/install-app.sh
./bin/clipboard-history --show
```

Available commands:

```bash
./bin/clipboard-history --show
./bin/clipboard-history --toggle
./bin/clipboard-history --hide
./bin/clipboard-history --background
./bin/clipboard-history --quit
./bin/clipboard-history --prefs
```

## Install on Ubuntu

Install to `~/.local`:

```bash
cd repo-git
chmod +x scripts/install-app.sh
./scripts/install-app.sh
```

Install and also enable autostart at login:

```bash
./scripts/install-app.sh --autostart
```

That creates:

- `~/.local/bin/clipboard-history`
- `~/.local/share/clipboard-history-app`
- `~/.local/share/applications/com.elyarestark.ClipboardHistory.desktop`

## Configure the GNOME Shortcut

In Ubuntu:

1. Open `Settings`
2. Go to `Keyboard`
3. Open `View and Customize Shortcuts`
4. Add a `Custom Shortcut`
5. Use a command like:

```bash
/home/elyarestark/.local/bin/clipboard-history --toggle
```

6. Assign `Super+V`

This is the recommended equivalent to the Windows clipboard-history shortcut on Ubuntu GNOME.

## Persistence

Configuration:

```text
~/.config/clipboard-history-app/config.json
```

History:

```text
~/.local/state/clipboard-history-app/history.json
```

## Compatibility Notes

- This format is a better fit for Ubuntu 24.04 GNOME than a shell extension for this use case.
- Clipboard text should be the most reliable path on both X11 and Wayland.
- Image capture is best effort and depends on what the source application exposes to the clipboard.
- The app must be running in the background for the custom shortcut to toggle the existing instance cleanly.

## Next Improvements

- Better image caching and thumbnails on disk.
- Richer preferences and exclusion rules.
- Optional top-bar indicator or tray integration.
- Better keyboard navigation in the list.
- Launch-at-login UI toggle.
