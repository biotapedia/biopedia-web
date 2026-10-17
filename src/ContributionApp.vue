<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { fetchData, fetchTaxon, ancestorPath } from '../catalog-api.js';
import { markdownImageUrls } from '../markdown.js';
import { nextRank, rankLabel, rankNames, safeHttps } from '../taxonomy.js';

const formRef = ref(null);
const parentPath = ref([]);
const choices = ref([]);
const choice = ref('');
const parentPage = ref(null);
const pickerStatus = ref('');
const pickerLoading = ref(false);
const newParent = reactive({ rank: 'kingdom', name_zh: '', scientific_name: '', description: '' });
const form = reactive({ rank: 'kingdom', name_zh: '', scientific_name: '', description: '', image_url: '', image_credit: '', source_url: '' });
const rankOptions = Object.entries(rankNames);
const repositoryUrl = ref('');
const draftVisible = ref(false);
const draftBody = ref('');
const draftMessage = ref('');
const draftLink = ref('');
const backHref = ref('./#/');
let pickerSequence = 0;

const pickerParent = computed(() => parentPath.value.at(-1) || null);
const parentLabel = computed(() => pickerParent.value ? pickerLabel(pickerParent.value) : '图鉴根目录');
function pickerLabel(node) { return `${node.name_zh} · ${rankLabel(node.rank)}${node.pending ? '（本次新增）' : ''}`; }

async function loadPickerPage(page = 1) {
  const sequence = pickerSequence;
  const parent = pickerParent.value;
  if (parent?.pending) {
    choices.value = [];
    parentPage.value = null;
    choice.value = '__new__';
    pickerStatus.value = '这是本次新增的分类，可继续补充缺失层级，或直接填写下方目标条目。';
    return;
  }
  if (page === 1) {
    choices.value = [];
    parentPage.value = null;
    choice.value = '';
  }
  pickerLoading.value = true;
  pickerStatus.value = '正在读取下级分类…';
  try {
    const data = await fetchData(parent ? `children/${parent.id}/${page}.json` : 'roots.json');
    if (sequence !== pickerSequence) return;
    choices.value = [...choices.value, ...data.items];
    parentPage.value = data.next ?? null;
    choice.value = page === 1 ? (choices.value.length ? '' : '__new__') : choice.value;
    pickerStatus.value = data.items.length || page > 1 ? '选择已有分类后会自动进入；若没有合适的分类，请选列表末尾的“没有我想要的分类”。' : '这里尚无下级分类，请填写下方表单新增。';
  } catch (cause) {
    if (sequence !== pickerSequence) return;
    if (page === 1) choice.value = '__new__';
    pickerStatus.value = `读取分类失败：${cause.message}。新增前请确认该分类尚不存在。`;
  } finally {
    if (sequence === pickerSequence) pickerLoading.value = false;
  }
}
function refreshPicker() {
  pickerSequence++;
  draftVisible.value = false;
  const suggested = pickerParent.value ? nextRank[pickerParent.value.rank] : 'kingdom';
  form.rank = suggested || 'unranked';
  newParent.rank = suggested || 'unranked';
  loadPickerPage();
}
function resetParent() { parentPath.value = []; refreshPicker(); }
function undoParent() { parentPath.value.pop(); refreshPicker(); }
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
    source_url: form.source_url.trim()
  };
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
    payload.source_url ? `- 资料来源：${payload.source_url}` : ''
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
      <p class="contribute-lead">从任意层级开始，选择已有分类；缺少上级分类时，也可以在同一次投稿中补齐。</p>
      <ol class="contribute-steps">
        <li><span>01</span><div><strong>确定分类路径</strong><p>沿已有目录逐级选择，或补充缺失层级。</p></div></li>
        <li><span>02</span><div><strong>填写条目资料</strong><p>提供名称、介绍，以及可以核对的来源。</p></div></li>
        <li><span>03</span><div><strong>交给社区审核</strong><p>确认 GitHub 投稿后，管理员会审阅内容。</p></div></li>
      </ol>
      <p class="contribute-note">你的草稿会在浏览器中生成。提交时会前往 GitHub 确认。</p>
    </section>

    <section class="contribute-sheet" aria-label="添加条目表单">
      <form ref="formRef" method="post" @submit.prevent="submit">
        <div class="contribute-form-head"><div><span class="section-kicker">CONTRIBUTE / 社区投稿</span><h2>填写条目信息</h2></div></div>
        <p class="contribute-form-intro">先选择已有上级分类；缺少中间层级时，可在这里补齐。所有新条目将进入同一个 Pull Request 审核。</p>

        <section class="parent-picker" aria-label="选择上级分类">
          <div class="picker-heading">
            <strong>上级分类路径</strong>
            <wa-button appearance="plain" variant="brand" size="s" type="button" @click="resetParent">从根目录重新选择</wa-button>
          </div>
          <div class="picker-path"><span class="picker-root">根目录</span><span v-for="(node, index) in parentPath" :key="index" :class="{ 'picker-new': node.pending }"> → {{ pickerLabel(node) }}</span></div>
          <p class="picker-status" role="status">{{ pickerStatus }}</p>
          <div class="picker-row">
            <wa-select
              label="选择已有的下级分类或新增分类"
              placeholder="选择分类后自动进入…"
              :value.prop="choice"
              :disabled="pickerLoading && !choices.length"
              @change="selectChoice($event.target.value)"
            >
              <wa-option v-if="pickerLoading && !choices.length" value="" disabled>正在加载下级分类…</wa-option>
              <wa-option v-for="item in choices" :key="item.id" :value="item.id">{{ item.name_zh }} · {{ rankLabel(item.rank) }} · {{ item.scientific_name }}</wa-option>
              <wa-option value="__new__">没有我想要的分类，新增一个…</wa-option>
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
          <wa-button v-if="parentPath.length" class="parent-undo" appearance="plain" variant="brand" size="s" type="button" @click="undoParent">撤销上一步</wa-button>
        </section>

        <div class="form-grid">
          <div class="form-field"><wa-input label="所选上级分类" :value.prop="parentLabel" hint="可在上方切换，或添加缺失层级" readonly></wa-input></div>
          <div class="form-field">
            <wa-select label="本次条目的分类级别" hint="例如新增物种选“种”；缺失的上级分类在上方单独选择级别。" name="rank" required :value.prop="form.rank" @change="form.rank = $event.target.value">
              <wa-option v-for="[value, label] in rankOptions" :key="value" :value="value">{{ label }}</wa-option>
            </wa-select>
          </div>
          <div class="form-field"><wa-input label="中文名" name="name_zh" required maxlength="120" :value.prop="form.name_zh" placeholder="例如：狮" @input="form.name_zh = $event.target.value"></wa-input></div>
          <div class="form-field"><wa-input label="学名" name="scientific_name" required maxlength="160" :value.prop="form.scientific_name" placeholder="例如：Panthera leo" @input="form.scientific_name = $event.target.value"></wa-input></div>
          <MarkdownEditor v-model="form.description" />
          <div class="form-field form-wide"><wa-input label="封面图片外链（HTTPS）" hint="用于条目顶部；正文中的图片请用上方“插入图片”按钮。" name="image_url" type="url" :value.prop="form.image_url" placeholder="https://example.org/photo.jpg" @input="form.image_url = $event.target.value"></wa-input></div>
          <div class="form-field"><wa-input label="封面图片作者及授权" name="image_credit" maxlength="1000" :value.prop="form.image_credit" placeholder="填写封面图片时必填" @input="form.image_credit = $event.target.value"></wa-input></div>
          <div class="form-field"><wa-input label="资料来源（HTTPS）" name="source_url" type="url" :value.prop="form.source_url" placeholder="https://example.org/source" @input="form.source_url = $event.target.value"></wa-input></div>
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
