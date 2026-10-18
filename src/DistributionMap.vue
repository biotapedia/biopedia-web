<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue';
import { geoCentroid, geoEqualEarth, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import topologyUrl from './assets/regions.topo.json?url';
import { regionIndex, regionLeaves } from './regions.js';

const props = defineProps({
  regions: { type: Array, required: true },
  interactive: { type: Boolean, default: false }
});
const emit = defineEmits(['toggle']);

const WIDTH = 640;
const SPHERE = { type: 'Sphere' };
const GRATICULE = geoGraticule10();
const MARKER_AREA = 30;
const DRAG_THRESHOLD = 4;

const topology = shallowRef(null);
const error = ref('');
const mode = ref('globe');
const rotation = ref([-105, -20]);
let drag = null;

const leafIds = computed(() => new Set(props.regions.flatMap(id => regionLeaves(id)).map(node => node.id)));

let topologyRequest = null;
function loadTopology() {
  topologyRequest ??= fetch(topologyUrl).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).catch(cause => {
    topologyRequest = null;
    throw cause;
  });
  return topologyRequest;
}

const baseShapes = computed(() => {
  const data = topology.value;
  if (!data) return null;
  const leaves = [...data.objects.sea.geometries, ...data.objects.land.geometries].map(geometry => ({ id: geometry.properties.id, feature: feature(data, geometry) }));
  return {
    land: merge(data, data.objects.land.geometries),
    borders: mesh(data, data.objects.land, (a, b) => a !== b),
    leaves
  };
});

const selectedShapes = computed(() => {
  const data = topology.value;
  if (!data) return null;
  const pick = object => data.objects[object].geometries.filter(geometry => leafIds.value.has(geometry.properties.id));
  return { land: merge(data, pick('land')), sea: merge(data, pick('sea')) };
});

const projection = computed(() => {
  const [lambda, phi] = rotation.value;
  if (mode.value === 'globe') return geoOrthographic().rotate([lambda, phi]).fitWidth(WIDTH, SPHERE);
  return geoEqualEarth().rotate([lambda, 0]).fitWidth(WIDTH, SPHERE);
});

const paths = computed(() => {
  if (!baseShapes.value) return null;
  const path = geoPath(projection.value);
  const selectedLeaves = baseShapes.value.leaves.filter(leaf => leafIds.value.has(leaf.id));
  // Small islands vanish at this scale, so selected leaves under a few pixels get a dot.
  const markers = selectedLeaves.filter(leaf => path.area(leaf.feature) < MARKER_AREA)
    .map(leaf => ({ id: leaf.id, point: path.centroid(leaf.feature) }))
    .filter(marker => marker.point.every(Number.isFinite));
  return {
    height: Math.ceil(path.bounds(SPHERE)[1][1]),
    sphere: path(SPHERE),
    graticule: path(GRATICULE),
    land: path(baseShapes.value.land),
    borders: path(baseShapes.value.borders),
    selectedLand: path(selectedShapes.value.land),
    selectedSea: path(selectedShapes.value.sea),
    hits: props.interactive ? baseShapes.value.leaves.map(leaf => ({ id: leaf.id, name: regionIndex.get(leaf.id)?.name, d: path(leaf.feature) })).filter(hit => hit.d) : [],
    markers
  };
});

const summary = computed(() => `分布地图：${props.regions.map(id => regionIndex.get(id)?.name).filter(Boolean).join('、') || '尚未选择'}`);

function startDrag(event) {
  drag = { x: event.clientX, y: event.clientY, moved: false, region: event.target.dataset?.region, scale: WIDTH / event.currentTarget.clientWidth, start: rotation.value };
  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
  drag.moved = true;
  const [lambda, phi] = drag.start;
  const k = drag.scale * (mode.value === 'globe' ? 0.35 : 0.5);
  rotation.value = [lambda + dx * k, Math.max(-90, Math.min(90, phi - dy * k))];
}

function endDrag() {
  // A press that never turned into a drag is a click on the region under it.
  if (drag && !drag.moved && drag.region && props.interactive) emit('toggle', drag.region);
  drag = null;
}

function rotateBy(event) {
  const steps = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
  if (!steps) return;
  event.preventDefault();
  const [lambda, phi] = rotation.value;
  rotation.value = [lambda + steps[0], Math.max(-90, Math.min(90, phi + steps[1]))];
}

onMounted(async () => {
  try {
    topology.value = await loadTopology();
    const selected = baseShapes.value.leaves.filter(leaf => leafIds.value.has(leaf.id)).map(leaf => leaf.feature);
    if (selected.length) {
      const [lon, lat] = geoCentroid({ type: 'FeatureCollection', features: selected });
      rotation.value = [-lon, Math.max(-50, Math.min(50, -lat))];
    }
  } catch (cause) {
    error.value = `地图暂时无法载入（${cause.message}）`;
  }
});
</script>

<template>
  <figure :class="['distribution-map', { 'distribution-map-interactive': interactive }]">
    <div class="distribution-modes" role="group" aria-label="地图视图">
      <button type="button" :aria-pressed="mode === 'globe'" @click="mode = 'globe'">地球仪</button>
      <button type="button" :aria-pressed="mode === 'flat'" @click="mode = 'flat'">平面</button>
    </div>
    <svg v-if="paths" :viewBox="`0 0 ${WIDTH} ${paths.height}`" role="img" :aria-label="summary" tabindex="0" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="drag = null" @keydown="rotateBy">
      <path class="map-sphere" :d="paths.sphere" />
      <path class="map-graticule" :d="paths.graticule" />
      <path class="map-sea-selected" :d="paths.selectedSea" />
      <path class="map-land" :d="paths.land" />
      <path class="map-land-selected" :d="paths.selectedLand" />
      <path class="map-borders" :d="paths.borders" />
      <g v-if="interactive" class="map-hits">
        <path v-for="hit in paths.hits" :key="hit.id" :d="hit.d" :data-region="hit.id"><title>{{ hit.name }}</title></path>
      </g>
      <circle v-for="marker in paths.markers" :key="marker.id" class="map-marker" :cx="marker.point[0]" :cy="marker.point[1]" r="5" :data-region="marker.id" />
      <path class="map-outline" :d="paths.sphere" />
    </svg>
    <p v-else class="distribution-status" role="status">{{ error || '正在载入地图…' }}</p>
    <figcaption>
      {{ interactive ? '点击区域选择或取消 · 拖动旋转' : '拖动或用方向键旋转' }}
      <details class="map-sources">
        <summary>地图来源</summary>
        <ul>
          <li>陆地区划：<a href="https://www.tdwg.org/standards/wgsrpd/" target="_blank" rel="noopener noreferrer">TDWG World Geographical Scheme for Recording Plant Distributions</a> 第 2 版（Brummitt, 2001）一、二级区。</li>
          <li>陆地边界：据 <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a> 1:1000 万国界（中国视角版本，公有领域）改绘。</li>
          <li>海区：FAO. 2024. FAO Major Fishing Areas for Statistical Purposes. In: FAO Fisheries and Aquaculture Division [online]. Accessed on 17 October 2026. <a href="https://www.fao.org/fishery/geonetwork/srv/api/records/ac02a460-da52-11dc-9d70-0017f293bd28" target="_blank" rel="noopener noreferrer">fao.org</a> Licence: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC-BY-4.0</a>。本站合并并简化了海区边界。</li>
          <li>海区边界与名称仅为示意，不代表 FAO 对任何国家、领土或海域的法律地位及其边界划定的意见；FAO 未参与、赞助或认可本站。</li>
        </ul>
      </details>
    </figcaption>
  </figure>
</template>
