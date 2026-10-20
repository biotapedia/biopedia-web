<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { fetchData, fetchTaxon } from '../catalog-api.js';
import { safeHttps } from '../taxonomy.js';

const featured = ref([]);
const rail = ref(null);
const canScroll = ref(false);
const paused = ref(false);
const reducedMotion = ref(false);
const failedImages = ref({});
let timer;
let motionPreference;
let resizeObserver;
let disposed = false;

function randomSample(ids, count) {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function updateOverflow() {
  if (rail.value) canScroll.value = rail.value.scrollWidth > rail.value.clientWidth + 1;
}

function failImage(id) {
  failedImages.value[id] = true;
  nextTick(updateOverflow);
}

function move(direction) {
  const track = rail.value;
  if (!track || !canScroll.value) return;
  const step = track.clientWidth * 0.8;
  const end = track.scrollWidth - track.clientWidth;
  const next = track.scrollLeft + direction * step;
  const left = next > end + 1 ? 0 : next < -1 ? end : next;
  track.scrollTo({ left, behavior: reducedMotion.value ? 'auto' : 'smooth' });
}

function focusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) paused.value = false;
}

function tick() {
  if (!paused.value && !reducedMotion.value && !document.hidden) move(1);
}

function updateMotion() {
  reducedMotion.value = motionPreference.matches;
}

onMounted(async () => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.value = motionPreference.matches;
  motionPreference.addEventListener('change', updateMotion);
  try {
    const list = await fetchData('species.json');
    if (!Array.isArray(list.ids)) return;
    const results = await Promise.allSettled(randomSample(list.ids, 8).map(id => fetchTaxon(id)));
    if (disposed) return;
    featured.value = results.flatMap(result => result.status === 'fulfilled' &&
      result.value.rank === 'species' && safeHttps(result.value.image_url) ? [result.value] : []);
    await nextTick();
    if (disposed || !rail.value) return;
    resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(rail.value);
    updateOverflow();
    if (featured.value.length > 1) timer = window.setInterval(tick, 6000);
  } catch (error) {
    // Recommendations are optional; the directory remains available if the data is offline.
    console.warn('无法读取首页推荐', error);
  }
});

onUnmounted(() => {
  disposed = true;
  window.clearInterval(timer);
  resizeObserver?.disconnect();
  motionPreference?.removeEventListener('change', updateMotion);
});
</script>

<template>
  <section v-if="featured.length" class="featured" aria-labelledby="featured-title" @mouseenter="paused = true" @mouseleave="paused = false" @focusin="paused = true" @focusout="focusOut" @touchstart.passive="paused = true">
    <div class="featured-heading">
      <div><p class="section-kicker">RANDOM DISCOVERY / 随机推荐</p><h2 id="featured-title">遇见这些物种</h2></div>
      <div v-if="canScroll" class="featured-controls" aria-label="推荐物种轮播控制">
        <button type="button" class="featured-arrow" aria-label="向左浏览物种图片" @click="move(-1)">←</button>
        <button type="button" class="featured-arrow" aria-label="向右浏览物种图片" @click="move(1)">→</button>
      </div>
    </div>
    <div ref="rail" class="featured-rail" role="group" aria-label="推荐物种图片，可横向滚动" tabindex="0">
      <a v-for="item in featured" :key="item.id" class="featured-card" :href="`#/taxon/${item.id}`" :aria-label="`查看${item.name_zh || item.scientific_name}（${item.scientific_name}）的物种档案`">
        <img v-if="!failedImages[item.id]" :src="safeHttps(item.image_url)" :alt="item.name_zh || item.scientific_name" decoding="async" referrerpolicy="no-referrer" @load="updateOverflow" @error="failImage(item.id)">
        <span v-else class="featured-image-fallback" aria-hidden="true">✳</span>
        <span class="featured-caption">
          <strong v-if="item.name_zh">{{ item.name_zh }}</strong>
          <em>{{ item.scientific_name }}</em>
          <small v-if="item.image_credit">{{ item.image_credit }}</small>
        </span>
      </a>
    </div>
  </section>
</template>
