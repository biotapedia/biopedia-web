<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref } from 'vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { fetchData, fetchTaxon, ancestorPath } from '../catalog-api.js';
import { markdownImageUrls } from '../markdown.js';
import { nextRank, rankLabel, rankNames, safeHttps } from '../taxonomy.js';
import { normalizeRegions, regionIndex, regionLeaves, regionPath, regionTree, toggleRegionLeaf } from './regions.js';

const DistributionMap = defineAsyncComponent(() => import('./DistributionMap.vue'));

const formRef = ref(null);
const parentPath = ref([]);
const choices = ref([]);
const choice = ref('');
const parentPage = ref(null);
const pickerStatus = ref('');
const pickerLoading = ref(false);
const pickerVersion = ref(0);
const editingIndex = ref(null);
const editChoices = ref([]);
const editPage = ref(null);
const editLoading = ref(false);
const editStatus = ref('');
const newParent = reactive({ rank: 'kingdom', name_zh: '', scientific_name: '', description: '' });
const form = reactive({ rank: 'kingdom', name_zh: '', scientific_name: '', description: '', image_url: '', image_credit: '', source_url: '', distribution: [] });
const rankOptions = Object.entries(rankNames);
const repositoryUrl = ref('');
const draftVisible = ref(false);
const draftBody = ref('');
const draftMessage = ref('');
const draftLink = ref('');
const backHref = ref('./#/');
let pickerSequence = 0;
let editSequence = 0;

const pickerParent = computed(() => parentPath.value.at(-1) || null);
const parentLabel = computed(() => pickerParent.value ? pickerLabel(pickerParent.value) : '图鉴根目录');
const regionGroups = [['land', '陆地'], ['sea', '海洋']].map(([kind, label]) => ({ kind, label, nodes: regionTree.filter(node => node.kind === kind) }));
// Checkbox state for every tree item, derived from the selected leaves so the tree and the map stay in step.
const regionStates = computed(() => {
  const selected = new Set(form.distribution.flatMap(id => regionLeaves(id)).map(node => node.id));
  return new Map([...regionIndex.values()].map(node => {
    const leaves = regionLeaves(node.id);
    const count = leaves.filter(leaf => selected.has(leaf.id)).length;
    return [node.id, { selected: count === leaves.length, indeterminate: count > 0 && count < leaves.length }];
  }));
});
function regionLabel(id) { return regionPath(id).map(node => node.name).join(' · '); }
function selectRegions(kind, items) {
  const kept = form.distribution.filter(id => regionIndex.get(id).kind !== kind);
  const leaves = items.map(item => item.dataset.region).filter(id => regionIndex.get(id)?.children.length === 0);
  form.distribution = normalizeRegions([...kept, ...leaves]);
}
function pickerLabel(node) { return `${node.name_zh} · ${rankLabel(node.rank)}${node.pending ? '（本次新增）' : ''}`; }
function levelWidth(node) { return `${Math.min(250, Math.max(104, [...pickerLabel(node)].length * 13 + 38))}px`; }

async function loadPickerPage(page = 1) {
  const sequence = pickerSequence;
  const parent = pickerParent.value;
  if (parent?.pending) {
    choices.value = [];
    parentPage.value = null;
    choice.value = '__new__';
    pickerStatus.value = '';
    return;
  }
  if (page === 1) {
    choices.value = [];
    parentPage.value = null;
    choice.value = '';
  }
  pickerLoading.value = true;
  pickerStatus.value = '';
  try {
    const data = await fetchData(parent ? `children/${parent.id}/${page}.json` : 'roots.json');
    if (sequence !== pickerSequence) return;
    choices.value = [...choices.value, ...data.items];
    parentPage.value = data.next ?? null;
    choice.value = page === 1 ? (choices.value.length ? '' : '__new__') : choice.value;
    pickerStatus.value = '';
  } catch (cause) {
    if (sequence !== pickerSequence) return;
    if (page === 1) choice.value = '__new__';
    pickerStatus.value = `读取分类失败：${cause.message}。新增前请确认该分类尚不存在。`;
  } finally {
    if (sequence === pickerSequence) pickerLoading.value = false;
  }
}
function refreshPicker() {
  cancelEdit();
  pickerSequence++;
  pickerVersion.value++;
  draftVisible.value = false;
  const suggested = pickerParent.value ? nextRank[pickerParent.value.rank] : 'kingdom';
  form.rank = suggested || 'unranked';
  newParent.rank = suggested || 'unranked';
  return loadPickerPage();
}
function cancelEdit() {
  editSequence++;
  editingIndex.value = null;
  editLoading.value = false;
  editStatus.value = '';
}
async function loadEditPage(page = 1) {
  const sequence = editSequence;
  const parent = parentPath.value[editingIndex.value - 1];
  if (parent?.pending) {
    editPage.value = null;
    return;
  }
  editLoading.value = true;
  try {
    const data = await fetchData(parent ? `children/${parent.id}/${page}.json` : 'roots.json');
    if (sequence !== editSequence) return;
    const byId = new Map([...editChoices.value, ...data.items].map(item => [item.id, item]));
    editChoices.value = [...byId.values()];
    editPage.value = data.next ?? null;
    editStatus.value = '';
  } catch (cause) {
    if (sequence === editSequence) editStatus.value = `读取同级分类失败：${cause.message}`;
  } finally {
    if (sequence === editSequence) editLoading.value = false;
  }
}
function openLevel(index) {
  if (editingIndex.value === index) return;
  editSequence++;
  editingIndex.value = index;
  const current = parentPath.value[index];
  editChoices.value = current.pending ? [] : [current];
  editPage.value = null;
  editStatus.value = '';
  loadEditPage();
}
async function selectEdited(index, select) {
  const value = select.value;
  if (!value) return;
  const current = parentPath.value[index];
  if (value === '__more__') {
    select.value = current.id ?? '__current__';
    if (editPage.value !== null) await loadEditPage(editPage.value);
    await nextTick();
    select.show();
    return;
  }
  if (value === (current.id ?? '__current__')) return;
  if (value === '__new__') {
    parentPath.value = parentPath.value.slice(0, index);
    await refreshPicker();
    choice.value = '__new__';
    return;
  }
  const selected = editChoices.value.find(item => item.id === value);
  if (!selected) return;
  parentPath.value = [...parentPath.value.slice(0, index), { id: selected.id, name_zh: selected.name_zh, rank: selected.rank, pending: false }];
  refreshPicker();
}
function selectChoice(value) {
  choice.value = value;
  if (!value || value === '__new__') return;
  const selected = choices.value.find(item => item.id === value);
  if (!selected) return;
  parentPath.value.push({ id: selected.id, name_zh: selected.name_zh, rank: selected.rank, pending: false });
  refreshPicker();
}
function addParent() {
  if (parentPath.value.filter(node => node.pending).length >= 8) { pickerStatus.value = '一次投稿最多补充 8 个缺失层级。'; return; }
  const name_zh = newParent.name_zh.trim();
  const scientific_name = newParent.scientific_name.trim();
  const description = newParent.description.trim();
  if (!name_zh || !scientific_name || description.length < 20) { pickerStatus.value = '新分类需要中文名、学名和至少 20 字的简介。'; return; }
  parentPath.value.push({ pending: true, rank: newParent.rank, name_zh, scientific_name, description });
  newParent.name_zh = '';
  newParent.scientific_name = '';
  newParent.description = '';
  refreshPicker();
}
function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function draftError(message) { draftVisible.value = true; draftMessage.value = message; return null; }
function prepareDraft() {
  if (!formRef.value.reportValidity()) return null;
  const ancestors = parentPath.value.filter(node => node.pending).map(({ rank, name_zh, scientific_name, description }) => ({ rank, name_zh, scientific_name, description }));
  const payload = {
    parent_id: [...parentPath.value].reverse().find(node => !node.pending)?.id ?? null,
    ancestors,
    rank: form.rank,
    name_zh: form.name_zh.trim(),
    scientific_name: form.scientific_name.trim(),
    description: form.description.trim(),
    image_url: form.image_url.trim(),
    image_credit: form.image_credit.trim(),
    source_url: form.source_url.trim(),
    ...(form.distribution.length ? { distribution: form.distribution } : {})
  };
  if (payload.description.length < 20 || payload.description.length > 10000) return draftError('介绍与特征需要 20 到 10000 字。');
  if (payload.image_url && !payload.image_credit) return draftError('填写图片链接时，请补充图片作者和授权。');
  if ((payload.image_url && !safeHttps(payload.image_url)) || (payload.source_url && !safeHttps(payload.source_url))) return draftError('图片链接和资料来源必须使用有效的 HTTPS 地址。');
  if (markdownImageUrls(payload.description).some(url => !safeHttps(url))) return draftError('介绍中的图片也必须使用有效的 HTTPS 外链。');
  const summary = [
    '## 新分类投稿',
    `- 中文名：${payload.name_zh}`,
    `- 学名：${payload.scientific_name}`,
    `- 上级分类路径：${parentPath.value.length ? parentPath.value.map(pickerLabel).join(' → ') : '根目录'}`,
    ...ancestors.map(node => `- 同时新增：${node.name_zh}（${node.scientific_name}，${rankLabel(node.rank)}）`),
    `- 分类级别：${rankLabel(payload.rank)}`,
    payload.image_url ? `- 图片：${payload.image_url}` : '',
    payload.image_credit ? `- 图片作者及授权：${payload.image_credit}` : '',
    payload.source_url ? `- 资料来源：${payload.source_url}` : '',
    form.distribution.length ? `- 分布地区：${form.distribution.map(regionLabel).join('、')}` : ''
  ].filter(Boolean);
  const body = [...summary, '', '### 介绍', '', payload.description, '', `<!-- BIOTA_SUBMISSION_V1\n${encodePayload(payload)}\n-->`].join('\n');
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 20000 || body.length > 50000) return draftError('投稿内容过长，请缩短介绍或分多次投稿。');
  return { payload, body };
}
function submit() {
  const draft = prepareDraft();
  if (!draft) return;
  draftVisible.value = true;
  draftBody.value = draft.body;
  draftLink.value = '';
  if (!repositoryUrl.value) { draftMessage.value = '草稿已生成。仓库管理员配置 GitHub 数据仓库地址后，就可以从这里提交。'; return; }
  const issueUrl = new URL(`${repositoryUrl.value}/issues/new`);
  issueUrl.searchParams.set('title', `新增分类：${draft.payload.name_zh}`);
  issueUrl.searchParams.set('body', draft.body);
  if (issueUrl.href.length <= 6000) {
    draftLink.value = issueUrl.href;
    draftMessage.value = '资料已准备好。打开 GitHub 页面，登录后确认提交即可。';
    window.open(issueUrl.href, '_blank', 'noopener,noreferrer');
  } else {
    const shortUrl = new URL(`${repositoryUrl.value}/issues/new`);
    shortUrl.searchParams.set('title', `新增分类：${draft.payload.name_zh}`);
    draftLink.value = shortUrl.href;
    draftMessage.value = '内容较长，避免 GitHub 拒绝过长网址：请先复制下方草稿，再打开 GitHub 投稿页面粘贴到正文。';
  }
}
async function copyDraft() {
  const draft = prepareDraft();
  if (!draft) return;
  draftVisible.value = true;
  draftBody.value = draft.body;
  try { await navigator.clipboard.writeText(draft.body); draftMessage.value = '投稿草稿已复制。'; }
  catch { draftMessage.value = '请选择并复制下方投稿草稿。'; }
}
onMounted(async () => {
  refreshPicker();
  fetchData('config.json').then(config => {
    if (typeof config.repository_url === 'string' && /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(config.repository_url)) repositoryUrl.value = config.repository_url.replace(/\/$/, '');
    else if (location.hostname.endsWith('.github.io')) repositoryUrl.value = `https://github.com/${location.hostname.split('.')[0]}/biopedia-data`;
  }).catch(() => {});
  const requestedParent = new URLSearchParams(location.search).get('parent');
  if (!requestedParent) return;
  const sequence = pickerSequence;
  try {
    const selected = await fetchTaxon(requestedParent);
    const ancestors = await ancestorPath(selected);
    if (sequence !== pickerSequence) return;
    parentPath.value = ancestors;
    backHref.value = `./#/taxon/${selected.id}`;
    refreshPicker();
  } catch (cause) {
    pickerStatus.value = `无法预选当前分类：${cause.message}。你仍可从根目录选择。`;
  }
});
</script>

<template>
  <header class="topbar">
    <a class="brand" href="./#/" aria-label="返回万物图鉴首页"><span class="brand-mark" aria-hidden="true">✳</span><span>BIOTAPEDIA <small>万物图鉴</small></span></a>
    <nav aria-label="主导航"><a class="back-to-catalog" :href="backHref">← 返回图鉴</a></nav>
  </header>

  <main class="contribute-layout">
    <section class="contribute-intro" aria-labelledby="contribute-title">
      <p class="section-kicker">CONTRIBUTE / 社区共建</p>
      <h1 id="contribute-title">让新的生命条目<br><em>加入图鉴。</em></h1>
    </section>

    <section class="contribute-sheet" aria-label="添加条目表单">
      <form ref="formRef" method="post" @submit.prevent="submit">
        <div class="contribute-form-head"><div><span class="section-kicker">CONTRIBUTE / 社区投稿</span><h2>填写条目信息</h2></div></div>

        <section class="parent-picker" aria-label="选择上级分类">
          <div class="picker-heading">
            <strong>上级分类路径</strong>
          </div>
          <nav class="picker-path" aria-label="已选择的上级分类路径">
            <span class="picker-path-node picker-root">根目录</span>
            <template v-for="(node, index) in parentPath" :key="`${index}:${node.id ?? node.name_zh}`">
              <span class="picker-separator" aria-hidden="true">→</span>
              <wa-select
                class="picker-level-select"
                :class="{ 'picker-new': node.pending }"
                :style="{ width: levelWidth(node) }"
                :label="`更改${pickerLabel(node)}`"
                size="s"
                :value.prop="node.id ?? '__current__'"
                @wa-show="openLevel(index)"
                @change="selectEdited(index, $event.target)"
              >
                <wa-option :value="node.id ?? '__current__'" :label="pickerLabel(node)">{{ pickerLabel(node) }}</wa-option>
                <template v-if="editingIndex === index">
                  <wa-option v-for="item in editChoices.filter(item => item.id !== node.id)" :key="item.id" :value="item.id" :label="pickerLabel(item)">{{ item.name_zh }} · {{ rankLabel(item.rank) }} · {{ item.scientific_name }}</wa-option>
                  <wa-option v-if="editLoading" value="__loading__" disabled>正在读取同级分类…</wa-option>
                  <wa-option v-if="editStatus" value="__error__" disabled>{{ editStatus }}</wa-option>
                  <wa-option v-if="editPage !== null" value="__more__">加载更多分类…</wa-option>
                </template>
                <wa-option value="__new__">没有合适的分类，重新新增…</wa-option>
              </wa-select>
            </template>
          </nav>
          <p v-if="pickerStatus" class="picker-status" role="status">{{ pickerStatus }}</p>
          <div class="picker-row">
            <wa-select
              :key="pickerVersion"
              label="下级分类"
              placeholder="选择下级分类…"
              :value.prop="choice"
              :disabled="pickerLoading && !choices.length"
              @change="selectChoice($event.target.value)"
            >
              <wa-option v-if="pickerLoading && !choices.length" value="" disabled>正在加载下级分类…</wa-option>
              <wa-option v-for="item in choices" :key="item.id" :value="item.id">{{ item.name_zh }} · {{ rankLabel(item.rank) }} · {{ item.scientific_name }}</wa-option>
              <wa-option value="__new__">新增分类…</wa-option>
            </wa-select>
            <wa-button v-if="parentPage !== null" appearance="outlined" variant="brand" size="s" type="button" :disabled="pickerLoading" @click="loadPickerPage(parentPage)">加载更多</wa-button>
          </div>

          <fieldset v-if="choice === '__new__'" class="new-parent-form">
            <legend>创建缺少的上级分类</legend>
            <div class="form-grid">
              <div class="form-field">
                <wa-select label="新增上级分类的级别" :value.prop="newParent.rank" @change="newParent.rank = $event.target.value">
                  <wa-option v-for="[value, label] in rankOptions" :key="value" :value="value">{{ label }}</wa-option>
                </wa-select>
              </div>
              <div class="form-field"><wa-input label="中文名" :value.prop="newParent.name_zh" maxlength="120" placeholder="例如：鹅膏属" @input="newParent.name_zh = $event.target.value"></wa-input></div>
              <div class="form-field"><wa-input label="学名" :value.prop="newParent.scientific_name" maxlength="160" placeholder="例如：Amanita" @input="newParent.scientific_name = $event.target.value"></wa-input></div>
              <div class="form-field form-wide"><wa-textarea label="简介" :value.prop="newParent.description" minlength="20" maxlength="10000" rows="2" placeholder="请描述这一上级分类，至少 20 字。" @input="newParent.description = $event.target.value"></wa-textarea></div>
            </div>
            <wa-button appearance="outlined" variant="brand" size="s" type="button" @click="addParent">添加到本次投稿路径</wa-button>
          </fieldset>
        </section>

        <div class="form-grid">
          <div class="form-field"><wa-input label="所选上级分类" :value.prop="parentLabel" readonly></wa-input></div>
          <div class="form-field">
            <wa-select label="本次条目的分类级别" name="rank" required :value.prop="form.rank" @change="form.rank = $event.target.value">
              <wa-option v-for="[value, label] in rankOptions" :key="value" :value="value">{{ label }}</wa-option>
            </wa-select>
          </div>
          <div class="form-field"><wa-input label="中文名" name="name_zh" required maxlength="120" :value.prop="form.name_zh" placeholder="例如：狮" @input="form.name_zh = $event.target.value"></wa-input></div>
          <div class="form-field"><wa-input label="学名" name="scientific_name" required maxlength="160" :value.prop="form.scientific_name" placeholder="例如：Panthera leo" @input="form.scientific_name = $event.target.value"></wa-input></div>
          <MarkdownEditor v-model="form.description" />
          <div class="form-field form-wide"><wa-input label="封面图片外链（HTTPS）" name="image_url" type="url" :value.prop="form.image_url" placeholder="https://example.org/photo.jpg" @input="form.image_url = $event.target.value"></wa-input></div>
          <div class="form-field"><wa-input label="封面图片作者及授权" name="image_credit" maxlength="1000" :value.prop="form.image_credit" placeholder="填写封面图片时必填" @input="form.image_credit = $event.target.value"></wa-input></div>
          <div class="form-field"><wa-input label="资料来源（HTTPS）" name="source_url" type="url" :value.prop="form.source_url" placeholder="https://example.org/source" @input="form.source_url = $event.target.value"></wa-input></div>
          <fieldset class="region-picker form-wide">
            <legend>分布地区（可选）</legend>
            <div class="region-picker-body">
              <div class="region-trees">
                <div v-for="group in regionGroups" :key="group.kind" class="region-group">
                  <span class="region-group-label">{{ group.label }}</span>
                  <wa-tree selection="multiple" :aria-label="`${group.label}分布地区`" @wa-selection-change="selectRegions(group.kind, $event.detail.selection)">
                    <wa-tree-item v-for="node in group.nodes" :key="node.id" :data-region="node.id" :selected.prop="regionStates.get(node.id).selected" :indeterminate.prop="regionStates.get(node.id).indeterminate">
                      {{ node.name }}
                      <wa-tree-item v-for="child in node.children" :key="child.id" :data-region="child.id" :selected.prop="regionStates.get(child.id).selected">{{ child.name }}</wa-tree-item>
                    </wa-tree-item>
                  </wa-tree>
                </div>
              </div>
              <DistributionMap :regions="form.distribution" interactive @toggle="form.distribution = toggleRegionLeaf(form.distribution, $event)" />
            </div>
            <div v-if="form.distribution.length" class="region-tags">
              <wa-tag v-for="id in form.distribution" :key="id" size="small" appearance="outlined" with-remove @wa-remove="form.distribution = form.distribution.filter(item => item !== id)">{{ regionLabel(id) }}</wa-tag>
            </div>
          </fieldset>
        </div>

        <div v-if="draftVisible" class="draft-panel">
          <p>{{ draftMessage }}</p>
          <wa-textarea label="投稿草稿" :value.prop="draftBody" readonly rows="6" resize="vertical"></wa-textarea>
          <a v-if="draftLink" :href="draftLink" target="_blank" rel="noopener noreferrer">打开 GitHub 投稿页面 ↗</a>
        </div>
        <div class="contribute-form-actions">
          <wa-button appearance="outlined" variant="brand" type="button" @click="copyDraft">复制草稿</wa-button>
          <wa-button appearance="filled" variant="brand" type="submit">准备投稿 <span aria-hidden="true">↗</span></wa-button>
        </div>
      </form>
    </section>
  </main>
  <footer class="footer"><span>BIOTAPEDIA / 万物图鉴</span><span>内容由社区共同维护 · 文字存于 GitHub 仓库</span></footer>
</template>
