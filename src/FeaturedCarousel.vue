<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { fetchData, fetchTaxon } from '../catalog-api.js';
import { conservationLabel, rankLabel, safeHttps, toxicityLabel } from '../taxonomy.js';

const featured = ref([]);
const current = ref(0);
const paused = ref(false);
const reducedMotion = ref(false);
const active = computed(() => featured.value[current.value]);
let timer;
let motionPreference;
let disposed = false;

function randomSample(ids, count) {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function show(index) {
  if (!featured.value.length) return;
  current.value = (index + featured.value.length) % featured.value.length;
}

function focusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) paused.value = false;
}

function tick() {
  if (!paused.value && !reducedMotion.value && !document.hidden) show(current.value + 1);
}

onMounted(async () => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.value = motionPreference.matches;
  motionPreference.addEventListener('change', updateMotion);
  try {
    const list = await fetchData('species.json');
    if (!Array.isArray(list.ids)) return;
    const results = await Promise.allSettled(randomSample(list.ids, 6).map(id => fetchTaxon(id)));
    if (disposed) return;
    featured.value = results.flatMap(result => result.status === 'fulfilled' &&
      result.value.rank === 'species' ? [result.value] : []);
    if (featured.value.length > 1) timer = window.setInterval(tick, 6000);
  } catch (error) {
    // Recommendations are optional; the directory remains available if the data is offline.
    console.warn('无法读取首页推荐', error);
  }
});

function updateMotion() {
  reducedMotion.value = motionPreference.matches;
}

onUnmounted(() => {
  disposed = true;
  window.clearInterval(timer);
  motionPreference?.removeEventListener('change', updateMotion);
});
</script>

<template>
  <section v-if="active" class="featured" aria-labelledby="featured-title" @mouseenter="paused = true" @mouseleave="paused = false" @focusin="paused = true" @focusout="focusOut">
    <div class="featured-heading">
      <div><p class="section-kicker">RANDOM DISCOVERY / 随机推荐</p><h2 id="featured-title">遇见这些物种</h2></div>
      <p>每次进入首页，遇见不同的物种</p>
    </div>
    <div class="featured-stage">
      <Transition name="featured-fade" mode="out-in">
        <article :key="active.id" class="featured-slide">
          <div class="featured-image">
            <img v-if="safeHttps(active.image_url)" :src="safeHttps(active.image_url)" :alt="active.name_zh || active.scientific_name" decoding="async" referrerpolicy="no-referrer" @error="$event.target.remove()">
            <span class="featured-image-fallback" aria-hidden="true">✳</span>
            <span class="featured-image-index" aria-hidden="true">{{ String(current + 1).padStart(2, '0') }} / {{ String(featured.length).padStart(2, '0') }}</span>
          </div>
          <div class="featured-copy">
            <p class="featured-overline">SPECIES / {{ rankLabel(active.rank) }}</p>
            <h3>{{ active.name_zh || active.scientific_name }}</h3>
            <p v-if="active.name_zh" class="featured-scientific">{{ active.scientific_name }}</p>
            <div class="featured-badges">
              <span v-if="conservationLabel(active.conservation_status)" :class="['status-badge', `status-${active.conservation_status}`]">{{ conservationLabel(active.conservation_status) }} · {{ active.conservation_status }}</span>
              <span v-if="toxicityLabel(active.toxicity)" :class="['toxicity-badge', `toxicity-${active.toxicity}`]">毒性 · {{ toxicityLabel(active.toxicity) }}</span>
            </div>
            <a class="featured-open" :href="`#/taxon/${active.id}`">查看物种档案 <span aria-hidden="true">↗</span></a>
            <p v-if="active.image_credit && safeHttps(active.image_url)" class="featured-credit">图片来源：{{ active.image_credit }}</p>
          </div>
        </article>
      </Transition>
    </div>
    <div v-if="featured.length > 1" class="featured-controls" aria-label="推荐物种轮播控制">
      <button type="button" class="featured-arrow" aria-label="上一个推荐物种" @click="show(current - 1)">←</button>
      <div class="featured-dots">
        <button v-for="(item, index) in featured" :key="item.id" type="button" :class="['featured-dot', { active: index === current }]" :aria-label="`查看推荐物种：${item.name_zh || item.scientific_name}`" :aria-current="index === current ? 'true' : undefined" @click="show(index)"></button>
      </div>
      <button type="button" class="featured-arrow" aria-label="下一个推荐物种" @click="show(current + 1)">→</button>
    </div>
  </section>
</template>
