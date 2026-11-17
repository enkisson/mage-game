#!/usr/bin/env bash
# Compact the coastal scans for the Wreck Shore rebuild: weld, simplify to a budget, WebP
# textures, one .glb each in public/assets/models. Run after: python3 tools/fetch-assets.py coast
#   bash tools/optimize-coast.sh [name ...]
set -uo pipefail
cd "$(dirname "$0")/.."
GT="${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli@4.5.1}"
SRC=assets-src/models
OUT=public/assets/models
mkdir -p "$OUT"
export GT SRC OUT
one() {
  local name=$1 ratio=$2 error=$3 tex=$4
  local tmp; tmp=$(mktemp -d)
  $GT weld "$SRC/$name/$name.gltf" "$tmp/a.glb" >/dev/null 2>&1
  if [ "$ratio" != "1" ]; then $GT simplify "$tmp/a.glb" "$tmp/b.glb" --ratio "$ratio" --error "$error" >/dev/null 2>&1; else cp "$tmp/a.glb" "$tmp/b.glb"; fi
  $GT prune "$tmp/b.glb" "$tmp/c.glb" >/dev/null 2>&1
  $GT resize "$tmp/c.glb" "$tmp/d.glb" --width "$tex" --height "$tex" >/dev/null 2>&1 || cp "$tmp/c.glb" "$tmp/d.glb"
  $GT webp "$tmp/d.glb" "$OUT/$name.glb" --quality 84 >/dev/null 2>&1
  printf '%-24s %s\n' "$name" "$(du -h "$OUT/$name.glb" | cut -f1)"
  rm -rf "$tmp"
}
export -f one
# name                ratio   error   texture
LIST=$(cat <<'L'
coastal_cliff_01      0.13    0.004   1024
coastal_cliff_02      0.07    0.004   1024
coastal_cliff_04      0.05    0.004   1024
coast_rocks_01        0.07    0.004   1024
coast_rocks_02        0.04    0.004   1024
coast_rocks_03        0.06    0.004   1024
coast_rocks_05        0.02    0.006   1024
coast_land_rocks_02   0.016   0.006   1024
coast_land_rocks_03   0.018   0.006   1024
coast_line_01         0.09    0.004   1024
coast_line_02         0.065   0.004   1024
sand_rocks_small_01   0.014   0.006   1024
rock_face_01          1       0       1024
mountainside          0.2     0.005   1024
dutch_ship_large_01   1       0       1024
wooden_lantern_01     1       0       512
treasure_chest        0.15    0.004   512
modular_fort_01       1       0       1024
gothic_statue         0.6     0.003   1024
root_cluster_01       0.1     0.006   1024
dead_tree_trunk       0.15    0.004   1024
fern_02               1       0       1024
grass_bermuda_01      1       0       1024
lambis_shell          0.3     0.004   512
L
)
want="$*"
echo "$LIST" | while read -r name ratio error tex; do
  [ -z "$name" ] && continue
  if [ -n "$want" ] && [[ " $want " != *" $name "* ]]; then continue; fi
  echo "$name $ratio $error $tex"
done | xargs -P 4 -L 1 bash -c 'one "$@"' _ 2>/dev/null || true
