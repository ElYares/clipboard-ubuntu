#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

glib-compile-schemas schemas
rm -f clipboard-history@elyarestark.zip
zip -r clipboard-history@elyarestark.zip \
  metadata.json extension.js prefs.js stylesheet.css README.md \
  lib ui schemas scripts
