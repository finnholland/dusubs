#!/usr/bin/env bash
# Copies the extension (dualsubs.lua) into VLC's per-user extensions folder.
# Usage: bash vlc-dualsubs/copy.sh
# Leaves userdata/ (saved settings) untouched. Restart VLC or reload extensions afterwards.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lua"
dest="${APPDATA//\//}/vlc/lua/extensions"

mkdir -p "$dest"
cp -f "$src/dualsubs.lua" "$dest/"

# Remove the modules folder left by the earlier multi-file layout.
rm -rf "$dest/modules"

echo "Copied to $dest"
