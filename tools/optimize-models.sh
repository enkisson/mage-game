#!/usr/bin/env bash
# Turn the raw scanned models in assets-src/models into compact .glb files in public/assets/models:
# fewer triangles, WebP textures, one file each.
#   python3 tools/fetch-assets.py models && bash tools/optimize-models.sh
set -euo pipefail
cd "$(dirname "$0")/.."
GT="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli@4.5.1}"
SRC=assets-src/models
OUT=public/assets/models
TMP=$(mktemp -d)
mkdir -p "$OUT"

# name  keep-this-fraction-of-triangles  allowed-error
while read -r name ratio error; do
  [ -z "$name" ] && continue
  in="$SRC/$name/$name.gltf"
  [ -f "$in" ] || { echo "missing $in (run tools/fetch-assets.py models)"; continue; }
  $GT weld "$in" "$TMP/a.glb" >/dev/null
  if [ "$ratio" != "1" ]; then
    $GT simplify "$TMP/a.glb" "$TMP/b.glb" --ratio "$ratio" --error "$error" >/dev/null
  else
    cp "$TMP/a.glb" "$TMP/b.glb"
  fi
  $GT prune "$TMP/b.glb" "$TMP/c.glb" >/dev/null
  $GT webp "$TMP/c.glb" "$OUT/$name.glb" --quality 82 >/dev/null
  printf '%-28s %s\n' "$name" "$(du -h "$OUT/$name.glb" | cut -f1)"
done <<'LIST'
dutch_ship_medium 0.8 0.0005
namaqualand_boulder_03 0.14 0.004
rock_09 0.25 0.004
wooden_crate_01 1 0
wooden_barrels_01 0.6 0.001
dry_branches_medium_01 0.35 0.002
LIST
rm -rf "$TMP"
du -sh "$OUT"
