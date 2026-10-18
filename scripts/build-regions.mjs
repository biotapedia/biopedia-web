// Rebuilds src/assets/regions.topo.json. Run with `npm run build:regions`; downloads are cached in the OS temp folder.
//
// Land: Natural Earth 1:10m countries, China point of view (public domain), grouped into TDWG WGSRPD level-2 regions.
// The WGSRPD tables say which regions each ISO country may fall in; WGSRPD level-3 shapes are only consulted to pick
// among those for countries that span several regions. None of the WGSRPD geometry ends up in the output.
// Sea: FAO major fishing areas (CC BY 4.0), dissolved and simplified.
// Region ids must match src/regions.js and biota-data/scripts/regions.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { geoDistance } from 'd3-geo';

const WGSRPD = 'https://raw.githubusercontent.com/tdwg/wgsrpd/master';
const SOURCES = {
  countries: ['zip', 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries_chn.zip'],
  provinces: ['zip', 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip'],
  level3: ['geojson', `${WGSRPD}/geojson/level3.geojson`],
  level3Table: ['txt', `${WGSRPD}/109-488-1-ED/2nd%20Edition/tblLevel3.txt`],
  level4Table: ['txt', `${WGSRPD}/109-488-1-ED/2nd%20Edition/tblLevel4.txt`],
  fao: ['json', 'https://www.fao.org/fishery/geoserver/fifao/ows?service=WFS&request=GetFeature&version=1.0.0&typeName=fifao:FAO_MAJOR&outputFormat=application/json']
};
// Natural Earth countries placed by hand. Under the China point of view CHN (which includes Taiwan), Hong Kong, Macao and
// Scarborough Reef belong to China, wherever WGSRPD puts them. The others are dependencies that Natural Earth labels with
// their sovereign's ISO code; they are placed where the WGSRPD tables list them.
const OVERRIDES = { CHN: 36, HKG: 36, MAC: 36, SCR: 36, IOA: 42, CSI: 50, ATC: 50, CLP: 80 };
// Islands this far from a country's main landmass may sit in another region (e.g. Bouvet Island in the Subantarctic).
const REMOTE = 500 / 6371;
const cache = path.join(os.tmpdir(), 'biota-regions');
const output = path.resolve(import.meta.dirname, '../src/assets/regions.topo.json');

async function download(name) {
  const [extension, url] = SOURCES[name];
  const file = path.join(cache, `${name}.${extension}`);
  if (!fs.existsSync(file)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return file;
}

async function run(commands, inputs = {}) {
  const files = await mapshaper.applyCommands(`${commands} -o out.json format=geojson`, Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, JSON.stringify(value)])));
  return JSON.parse(String(files['out.json']));
}

async function readTable(name) {
  const [header, ...rows] = fs.readFileSync(await download(name), 'latin1').trim().split(/\r?\n/).map(line => line.split('*'));
  return rows.map(row => Object.fromEntries(header.map((key, index) => [key, row[index]])));
}

// ISO alpha-2 code → level-2 region codes that WGSRPD assigns to it.
async function regionsByIso() {
  const level2 = new Map((await readTable('level3Table')).map(row => [row['L3 code'], Number.parseInt(row['L2 code'])]));
  const result = new Map();
  for (const row of await readTable('level4Table')) {
    const iso = row['L4 ISOcode'];
    if (!iso) continue;
    if (!result.has(iso)) result.set(iso, new Set());
    result.get(iso).add(level2.get(row['L3 code']));
  }
  return result;
}

// Tags every separate polygon part with the WGSRPD level-2 region it overlaps most (null when it overlaps none).
async function tagParts(features, reference) {
  const tagged = await run('-i in.json -explode -join ref.json largest-overlap fields=LEVEL2_COD -each "area = this.area"', {
    'in.json': { type: 'FeatureCollection', features },
    'ref.json': reference
  });
  return tagged.features;
}

function dominant(parts, allowed) {
  const areas = new Map();
  for (const { properties: { LEVEL2_COD: code, area } } of parts) if (allowed.has(code)) areas.set(code, (areas.get(code) || 0) + area);
  return [...areas].sort((a, b) => b[1] - a[1])[0]?.[0] ?? [...allowed][0];
}

const region = (feature, code) => ({ type: 'Feature', properties: { id: `tdwg-${code}` }, geometry: feature.geometry });
const outerRing = part => part.geometry.coordinates[0];

// Assigns a whole country to one region, except remote islands that WGSRPD places elsewhere.
function assignParts(parts, code) {
  const main = parts.reduce((largest, part) => part.properties.area > largest.properties.area ? part : largest);
  return parts.map(part => {
    const tag = part.properties.LEVEL2_COD;
    if (part === main || tag == null || tag === code) return region(part, code);
    const ring = outerRing(part);
    const point = [0, 1].map(axis => ring.reduce((sum, vertex) => sum + vertex[axis], 0) / ring.length);
    const distance = Math.min(...outerRing(main).map(vertex => geoDistance(point, vertex)));
    return region(part, distance > REMOTE ? tag : code);
  });
}

async function buildLand() {
  const allowedByIso = await regionsByIso();
  const allowedFor = (...codes) => new Set(codes.flatMap(code => [...(allowedByIso.get(code) || [])]));
  const reference = await run(`-i "${await download('level3')}" snap -clean -dissolve LEVEL2_COD`);
  const countries = (await run(`-i "${await download('countries')}" -target type=polygon -filter-fields ADM0_A3,ADMIN,ISO_A2_EH`)).features;
  const provinces = (await run(`-i "${await download('provinces')}" -target type=polygon -rename-fields ADM0_A3=adm0_a3 -filter-fields ADM0_A3,iso_3166_2,type_en`)).features;
  const countryParts = Map.groupBy(await tagParts(countries, reference), part => part.properties.ADM0_A3);
  const provinceParts = Map.groupBy(await tagParts(provinces, reference), part => part.properties.ADM0_A3);
  // Overseas departments (e.g. FR-RE, Réunion) are listed in WGSRPD under their own ISO code.
  const subdivisionIso = piece => piece.properties.type_en === 'Overseas department' ? piece.properties.iso_3166_2.slice(3) : undefined;

  const land = [];
  for (const country of countries) {
    const { ADM0_A3: code, ADMIN: name, ISO_A2_EH: iso } = country.properties;
    if (code in OVERRIDES) { land.push(region(country, OVERRIDES[code])); continue; }
    const parts = countryParts.get(code) || [];
    const pieces = provinceParts.get(code) || [];
    const allowed = allowedFor(iso, ...pieces.map(subdivisionIso).filter(Boolean));
    if (!allowed.size) {
      // Not in the WGSRPD tables (e.g. disputed or uninhabited areas): follow the geometry.
      const tagged = new Set(parts.map(part => part.properties.LEVEL2_COD).filter(value => value != null));
      if (!tagged.size) { console.warn(`skipped ${code} ${name}: in no WGSRPD table or region`); continue; }
      land.push(...assignParts(parts, dominant(parts, tagged)));
      continue;
    }
    if (allowed.size === 1) { land.push(...assignParts(parts, [...allowed][0])); continue; }
    // The country spans several regions: split it by province where possible, trimmed to its China-view outline.
    const split = pieces.length ? pieces : parts;
    const fallback = dominant(split, allowed);
    const clipped = await run('-i in.json -clip clip.json remove-slivers', {
      'in.json': { type: 'FeatureCollection', features: split },
      'clip.json': { type: 'FeatureCollection', features: [country] }
    });
    const assigned = clipped.features.map(piece => {
      const permitted = subdivisionIso(piece) ? allowedFor(subdivisionIso(piece), iso) : allowed;
      return region(piece, permitted.has(piece.properties.LEVEL2_COD) ? piece.properties.LEVEL2_COD : fallback);
    });
    land.push(...assigned);
    console.log(`split ${code} ${name} into ${[...new Set(assigned.map(piece => piece.properties.id))].sort().join(', ')}`);
  }
  return run('-i in.json snap -clean -dissolve id -simplify 2% keep-shapes -clean', { 'in.json': { type: 'FeatureCollection', features: land } });
}

async function buildSea() {
  return run(`-i "${await download('fao')}" snap -clean -dissolve F_CODE -each "id = 'fao-' + F_CODE" -filter-fields id -simplify 1% keep-shapes -clean`);
}

fs.mkdirSync(cache, { recursive: true });
const [land, sea] = await Promise.all([buildLand(), buildSea()]);
const files = await mapshaper.applyCommands('-i land.json sea.json combine-files -o out.json format=topojson quantization=1e5 target=*', {
  'land.json': JSON.stringify(land),
  'sea.json': JSON.stringify(sea)
});
fs.writeFileSync(output, files['out.json']);
console.log(`wrote ${path.relative(process.cwd(), output)}: ${land.features.length} land and ${sea.features.length} sea regions`);
