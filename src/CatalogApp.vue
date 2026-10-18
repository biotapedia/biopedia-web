<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { fetchData, fetchTaxon, ancestorPath } from '../catalog-api.js';
import { conservationLabel, rankLabel, safeHttps } from '../taxonomy.js';

// The cover is shown whole; this lets its own blurred copy fill the space around it.
import { renderMarkdown } from '../markdown.js';
import { regionIndex, regionPath } from './regions.js';

const DistributionMap = defineAsyncComponent(() => import('./DistributionMap.vue'));

const taxon = ref(null);
const path = ref([]);
const items = ref([]);
const nextPage = ref(null);
const filter = ref('');
const status = ref('正在连接图鉴…');
const error = ref('');
const loadingMore = ref(false);
const total = ref(0);
let renderSequence = 0;

const distribution = computed(() => Array.isArray(taxon.value?.distribution) ? taxon.value.distribution.filter(id => regionIndex.has(id)) : []);
const contributionHref = computed(() => `./contribute.html${taxon.value ? `?parent=${encodeURIComponent(taxon.value.id)}` : ''}`);
const visibleItems = computed(() => items.value.filter(item => `${item.name_zh} ${item.scientific_name}`.toLocaleLowerCase().includes(filter.value.trim().toLocaleLowerCase())));
const emptyMessage = computed(() => {
  if (error.value) return `${error.value}。请稍后重试。`;
  if (items.value.length && !visibleItems.value.length) return '当前已加载的目录里没有匹配项。';
  if (!taxon.value && !items.value.length) return '还没有分类，欢迎贡献第一个条目。';
  if (taxon.value && !total.value) return '这个分类还没有下级条目。你可以帮助社区补充。';
  return '';
});
const vMarkdown = {
  mounted(element, binding) { element.replaceChildren(renderMarkdown(binding.value || '')); },
  updated(element, binding) { if (binding.value !== binding.oldValue) element.replaceChildren(renderMarkdown(binding.value || '')); }
};

async function route() {
  const sequence = ++renderSequence;
  const match = location.hash.match(/^#\/taxon\/([a-z0-9-]+)$/);
  taxon.value = null;
  path.value = [];
  items.value = [];
  nextPage.value = null;
  filter.value = '';
  total.value = 0;
  error.value = '';
  status.value = match ? '正在读取分类…' : '正在读取目录…';
  try {
    if (match) {
      const selected = await fetchTaxon(match[1]);
      const ancestors = await ancestorPath(selected);
      const firstPage = await fetchData(`children/${selected.id}/1.json`);
      if (sequence !== renderSequence) return;
      taxon.value = selected;
      path.value = ancestors;
      items.value = firstPage.items;
      nextPage.value = firstPage.next;
      total.value = firstPage.total;
      status.value = `${rankLabel(selected.rank)} · ${firstPage.total} 个下级分类`;
    } else {
      const roots = await fetchData('roots.json');
      if (sequence !== renderSequence) return;
      items.value = roots.items;
      total.value = roots.items.length;
      status.value = `${roots.items.length} 个起始分类`;
    }
  } catch (cause) {
    if (sequence !== renderSequence) return;
    error.value = cause.message;
    status.value = '读取失败';
  }
}

async function loadMore() {
  if (!taxon.value || nextPage.value === null || loadingMore.value) return;
  const sequence = renderSequence;
  const page = nextPage.value;
  loadingMore.value = true;
  try {
    const data = await fetchData(`children/${taxon.value.id}/${page}.json`);
    if (sequence !== renderSequence) return;
    items.value = [...items.value, ...data.items];
    nextPage.value = data.next;
  } catch (cause) {
    if (sequence === renderSequence) status.value = cause.message;
  } finally {
    loadingMore.value = false;
  }
}

onMounted(() => { window.addEventListener('hashchange', route); route(); });
onUnmounted(() => { window.removeEventListener('hashchange', route); });
</script>

<template>
  <header class="topbar">
    <a class="brand" href="#/" aria-label="返回万物图鉴首页"><span class="brand-mark" aria-hidden="true">✳</span><span>BIOTAPEDIA <small>万物图鉴</small></span></a>
    <nav aria-label="主导航"><a href="#/">探索分类</a><a class="header-contribute" :href="contributionHref">贡献一个条目 <span aria-hidden="true">↗</span></a></nav>
  </header>

  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="eyebrow"><span class="eyebrow-dot"></span> 一个由社区共同书写的生命目录</p>
      <h1 id="hero-title">沿着生命的脉络，<br><em>发现万物。</em></h1>
      <p class="hero-description">从界到种，逐层探索；每一个条目，都可以由好奇的你补全。</p>
      <div class="hero-actions"><a class="primary-link" href="#catalog">开始探索 <span aria-hidden="true">↘</span></a><span class="hero-note">开放资料 · 逐级浏览 · 社区共建</span></div>
    </div>
    <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><div class="leaf leaf-one"></div><div class="leaf leaf-two"></div><div class="leaf leaf-three"></div><div class="art-center">B<span>·</span></div><span class="art-label art-label-top">NATURE / INDEX</span><span class="art-label art-label-bottom">01 — ∞</span></div>
  </section>

  <main id="catalog" class="catalog-layout">
    <aside class="sidebar" aria-label="分类路径">
      <div class="sidebar-heading"><span class="section-kicker">FIELD NOTES / 目录</span><h2>探索路径</h2></div>
      <nav class="path-nav" aria-label="当前分类路径">
        <a href="#/" :class="['path-item', { active: !path.length }]"><span class="path-bullet">◎</span><span>全部分类</span></a>
        <a v-for="(ancestor, index) in path" :key="ancestor.id" :href="`#/taxon/${ancestor.id}`" :class="['path-item', { active: index === path.length - 1 }]" :style="{ '--path-depth': index + 1 }"><span class="path-bullet">↳</span><span>{{ ancestor.name_zh }}</span></a>
      </nav>
      <wa-card class="sidebar-tip" appearance="plain"><span class="tip-symbol" aria-hidden="true">↗</span><p>发现资料缺失？<br>从当前分类直接发起投稿。</p><a class="sidebar-contribute" :href="contributionHref">参与共建 <span aria-hidden="true">→</span></a></wa-card>
    </aside>

    <section class="catalog-content" aria-live="polite">
      <div class="content-topline"><span class="section-kicker">LIVING CATALOG / 生物分类</span><span class="content-status">{{ status }}</span></div>
      <div v-if="taxon && !error" class="detail">
        <article class="taxon-detail">
          <div class="detail-copy"><div class="detail-rank"><span class="detail-rank-badge">{{ rankLabel(taxon.rank) }}</span><span v-if="conservationLabel(taxon.conservation_status)" :class="['status-badge', `status-${taxon.conservation_status}`]" :title="`IUCN 红色名录：${conservationLabel(taxon.conservation_status)}`">{{ conservationLabel(taxon.conservation_status) }} · {{ taxon.conservation_status }}</span><span>{{ taxon.id }}</span></div><h2 class="detail-title">{{ taxon.name_zh }}</h2><p class="detail-latin">{{ taxon.scientific_name }}</p><div v-markdown="taxon.body" class="prose"></div><a v-if="safeHttps(taxon.source_url)" class="source-link" :href="safeHttps(taxon.source_url)" target="_blank" rel="noopener noreferrer">查看资料来源 ↗</a></div>
          <figure class="detail-figure">
            <div class="detail-visual"><img v-if="safeHttps(taxon.image_url)" :src="safeHttps(taxon.image_url)" :alt="taxon.name_zh" loading="lazy" referrerpolicy="no-referrer" @error="$event.target.remove()"><span class="visual-glyph">✳</span><span class="visual-label">生命之树 / BIOTAPEDIA</span></div>
            <details v-if="taxon.image_credit && safeHttps(taxon.image_url)" class="image-credit"><summary>图片来源</summary><p>{{ taxon.image_credit }}</p></details>
          </figure>
        </article>
        <section v-if="distribution.length" class="distribution" aria-labelledby="distribution-title">
          <div class="distribution-head"><p class="section-kicker">RANGE / 分布</p><h3 id="distribution-title">分布地区</h3></div>
          <div class="distribution-body">
            <DistributionMap :key="taxon.id" :regions="distribution" />
            <ul class="distribution-list">
              <li v-for="region in distribution.map(regionPath)" :key="region.at(-1).id" :class="`distribution-${region[0].kind}`"><span class="distribution-swatch" aria-hidden="true"></span><span><small v-if="region.length > 1">{{ region[0].name }}</small>{{ region.at(-1).name }}</span></li>
            </ul>
          </div>
        </section>
      </div>
      <div class="directory-heading"><div><p class="section-kicker">{{ taxon ? 'CONTINUE / 继续探索' : 'DISCOVER / 从这里开始' }}</p><h2>{{ error ? '连接失败' : taxon ? (total ? `${taxon.name_zh}的下级分类` : '目录尽头') : '探索生命的主要类群' }}</h2></div><label class="filter-field"><span class="sr-only">筛选当前目录</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"></circle><path d="m16 16 4.3 4.3"></path></svg><input v-model="filter" type="search" placeholder="筛选当前目录…" autocomplete="off"></label></div>
      <div class="card-grid">
        <a v-for="(item, index) in visibleItems" :key="item.id" class="taxon-link" :href="`#/taxon/${item.id}`" :aria-label="`${rankLabel(item.rank)}：${item.name_zh}，${item.scientific_name}${conservationLabel(item.conservation_status) ? `，${conservationLabel(item.conservation_status)}` : ''}${item.child_count ? `，${item.child_count} 个下级分类` : ''}`">
          <wa-card class="taxon-card" appearance="plain"><div class="taxon-card-inner"><div class="card-top"><span class="card-tags"><span class="card-rank">{{ rankLabel(item.rank) }}</span><span v-if="conservationLabel(item.conservation_status)" :class="['status-badge', `status-${item.conservation_status}`]" :title="`IUCN 红色名录：${conservationLabel(item.conservation_status)}`">{{ conservationLabel(item.conservation_status) }} · {{ item.conservation_status }}</span></span><span class="card-index">{{ String(items.indexOf(item) + 1).padStart(2, '0') }}</span></div><div class="card-body"><h3>{{ item.name_zh }}</h3><p class="latin-name">{{ item.scientific_name }}</p></div><div class="card-bottom"><span>{{ item.child_count ? `${item.child_count} 个下级分类` : '查看详情' }}</span><span class="card-arrow">↗</span></div></div></wa-card>
        </a>
      </div>
      <wa-button v-if="nextPage !== null && !error" class="load-more" type="button" appearance="outlined" variant="brand" :disabled="loadingMore" @click="loadMore">加载更多分类 <span aria-hidden="true">↓</span></wa-button>
      <p v-if="emptyMessage && status !== '正在读取目录…' && status !== '正在读取分类…'" class="empty-state">{{ emptyMessage }}</p>
    </section>
  </main>
  <footer class="footer"><span>BIOTAPEDIA / 万物图鉴</span><span>内容由社区共同维护 · 文字存于 GitHub 仓库</span></footer>
</template>
