#!/bin/sh
# Rebuilds src/assets/regions.topo.json from TDWG WGSRPD level 3 and FAO major fishing areas.
# Land is dissolved to WGSRPD level 2 with Taiwan (TAI) moved into China (36); ids must match src/regions.js.
set -eu
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mapshaper="npx --yes mapshaper@0.6.121"

curl -fsSL -o "$work/level3.geojson" https://raw.githubusercontent.com/tdwg/wgsrpd/master/geojson/level3.geojson
curl -fsSL -o "$work/fao.json" 'https://www.fao.org/fishery/geoserver/fifao/ows?service=WFS&request=GetFeature&version=1.0.0&typeName=fifao:FAO_MAJOR&outputFormat=application/json'

$mapshaper -i "$work/level3.geojson" snap name=land -clean \
  -each 'LEVEL2_COD = LEVEL3_COD == "TAI" ? 36 : LEVEL2_COD' \
  -dissolve LEVEL2_COD -each 'id = "tdwg-" + LEVEL2_COD' -filter-fields id \
  -simplify 8% keep-shapes -clean \
  -o "$work/land.json" format=geojson precision=0.001
$mapshaper -i "$work/fao.json" snap name=sea -clean \
  -dissolve F_CODE -each 'id = "fao-" + F_CODE' -filter-fields id \
  -simplify 1% keep-shapes -clean \
  -o "$work/sea.json" format=geojson precision=0.001
$mapshaper -i "$work/land.json" "$work/sea.json" combine-files \
  -o src/assets/regions.topo.json format=topojson quantization=1e5 'target=*'
