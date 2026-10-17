import { parseFrontMatter } from './markdown.js';
import { nextRank, rankLabel, safeHttps } from './taxonomy.js';
import { makeText, renderPath, renderCard, renderTaxonDetail } from './catalog-components.js';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// Both repositories are sibling project sites under the same GitHub Pages host.
// Local preview serves this directory and biota-data from the shared parent.
const dataBase = new URL(isLocal ? '../biota-data/docs/' : '../biopedia-data/', import.meta.url);
const $ = selector => document.querySelector(selector);
const taxonCache = new Map();
let repositoryUrl = '';
let currentTaxon = null;
let currentItems = [];
let nextPage = null;
let renderSequence = 0;

async function fetchData(relative, kind = 'json') {
  const response = await fetch(new URL(relative, dataBase), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`图鉴数据暂时不可用（HTTP ${response.status}）`);
  return kind === 'text' ? response.text() : response.json();
}

async function fetchTaxon(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('分类编号无效');
  if (!taxonCache.has(id)) {
    taxonCache.set(id, fetchData(`taxa/${id}.md`, 'text').then(parseFrontMatter).catch(error => {
      taxonCache.delete(id);
      throw error;
    }));
  }
  return taxonCache.get(id);
}

function setStatus(message) { $('#content-status').textContent = message; }
function showError(error) {
  $('#detail').replaceChildren();
  $('#children').replaceChildren();
  $('#empty-state').hidden = false;
  $('#empty-state').textContent = `${error.message}。请稍后重试。`;
  $('#directory-title').textContent = '连接失败';
  setStatus('读取失败');
}

function applyFilter() {
  const query = $('#directory-filter').value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const card of $('#children').children) {
    card.hidden = !card.dataset.search.includes(query);
    if (!card.hidden) visible++;
  }
  if (currentItems.length) {
    $('#empty-state').hidden = visible > 0;
    if (!visible) $('#empty-state').textContent = '当前已加载的目录里没有匹配项。';
  }
}

function appendCards(items) {
  const start = currentItems.length;
  currentItems.push(...items);
  $('#children').append(...items.map((item, index) => renderCard(item, start + index)));
  applyFilter();
}

function resetDirectory() {
  currentItems = [];
  nextPage = null;
  $('#children').replaceChildren();
  $('#directory-filter').value = '';
  $('#empty-state').hidden = true;
  $('#load-more').hidden = true;
}

async function ancestorPath(taxon) {
  const path = [taxon];
  const seen = new Set([taxon.id]);
  let parent = taxon.parent_id;
  while (parent !== null) {
    if (seen.has(parent) || path.length > 50) throw new Error('分类路径存在循环');
    seen.add(parent);
    const ancestor = await fetchTaxon(parent);
    path.unshift(ancestor);
    parent = ancestor.parent_id;
  }
  return path;
}

async function renderHome(sequence) {
  currentTaxon = null;
  resetDirectory();
  $('#detail').replaceChildren();
  renderPath([]);
  $('#directory-kicker').textContent = 'DISCOVER / 从这里开始';
  $('#directory-title').textContent = '探索生命的主要类群';
  setStatus('正在读取目录…');
  const data = await fetchData('roots.json');
  if (sequence !== renderSequence) return;
  appendCards(data.items);
  setStatus(`${data.items.length} 个起始分类`);
  if (!data.items.length) {
    $('#empty-state').hidden = false;
    $('#empty-state').textContent = '还没有分类，欢迎贡献第一个条目。';
  }
}

async function renderTaxon(id, sequence) {
  resetDirectory();
  setStatus('正在读取分类…');
  const taxon = await fetchTaxon(id);
  const path = await ancestorPath(taxon);
  const firstPage = await fetchData(`children/${id}/1.json`);
  if (sequence !== renderSequence) return;
  currentTaxon = taxon;
  renderPath(path);
  renderTaxonDetail(taxon);
  $('#directory-kicker').textContent = 'CONTINUE / 继续探索';
  $('#directory-title').textContent = firstPage.total ? `${taxon.name_zh}的下级分类` : '目录尽头';
  appendCards(firstPage.items);
  nextPage = firstPage.next;
  $('#load-more').hidden = nextPage === null;
  if (!firstPage.total) {
    $('#empty-state').hidden = false;
    $('#empty-state').textContent = '这个分类还没有下级条目。你可以帮助社区补充。';
  }
  setStatus(`${rankLabel(taxon.rank)} · ${firstPage.total} 个下级分类`);
}

async function route() {
  const sequence = ++renderSequence;
  const match = location.hash.match(/^#\/taxon\/([a-z0-9-]+)$/);
  try {
    if (match) await renderTaxon(match[1], sequence);
    else await renderHome(sequence);
  } catch (error) {
    if (sequence === renderSequence) showError(error);
  }
}

$('#load-more').addEventListener('click', async () => {
  if (!currentTaxon || nextPage === null) return;
  const sequence = renderSequence;
  const page = nextPage;
  $('#load-more').disabled = true;
  try {
    const data = await fetchData(`children/${currentTaxon.id}/${page}.json`);
    if (sequence !== renderSequence) return;
    appendCards(data.items);
    nextPage = data.next;
    $('#load-more').hidden = nextPage === null;
  } catch (error) {
    setStatus(error.message);
  } finally {
    $('#load-more').disabled = false;
  }
});
$('#directory-filter').addEventListener('input', applyFilter);
window.addEventListener('hashchange', route);

const dialog = $('#contribute-dialog');
let parentPath = [];
let parentPage = null;
let pickerSequence = 0;
const newParentChoice = '__new__';
const parentRank = $('#new-parent-rank');
parentRank.replaceChildren(...Array.from($('[name="rank"]').options, option => option.cloneNode(true)));

function pickerParent() { return parentPath.at(-1) || null; }
function pickerLabel(node) { return `${node.name_zh} · ${rankLabel(node.rank)}${node.pending ? '（本次新增）' : ''}`; }
function newParentOption() {
  const option = document.createElement('option');
  option.value = newParentChoice;
  option.textContent = '没有我想要的分类，新增一个…';
  return option;
}
function syncParentChoice() {
  const choice = $('#parent-choice');
  const creating = choice.value === newParentChoice;
  $('#new-parent-form').hidden = !creating;
  $('#parent-select').hidden = creating;
  $('#parent-select').disabled = choice.disabled || !choice.value || creating;
}
function updatePickerPath() {
  const path = $('#parent-path');
  path.replaceChildren(makeText('span', 'picker-root', '根目录'));
  for (const node of parentPath) path.append(makeText('span', node.pending ? 'picker-new' : '', ` → ${pickerLabel(node)}`));
  $('#form-parent-label').value = pickerParent() ? pickerLabel(pickerParent()) : '图鉴根目录';
  $('#parent-undo').hidden = parentPath.length === 0;
  $('#draft-panel').hidden = true;
  const suggested = pickerParent() ? nextRank[pickerParent().rank] : 'kingdom';
  $('[name="rank"]').value = suggested || 'unranked';
  parentRank.value = suggested || 'unranked';
}

async function loadPickerPage(page = 1) {
  const sequence = pickerSequence;
  const parent = pickerParent();
  const choice = $('#parent-choice');
  if (parent?.pending) {
    parentPage = null;
    choice.replaceChildren(newParentOption());
    choice.disabled = false;
    $('#parent-more').hidden = true;
    syncParentChoice();
    $('#parent-status').textContent = '这是本次新增的分类，可继续补充缺失层级，或直接填写下方目标条目。';
    return;
  }
  if (page === 1) {
    parentPage = null;
    choice.replaceChildren(makeText('option', '', '正在加载下级分类…'));
    choice.disabled = true;
    syncParentChoice();
  }
  $('#parent-more').hidden = true;
  $('#parent-status').textContent = '正在读取下级分类…';
  try {
    const data = await fetchData(parent ? `children/${parent.id}/${page}.json` : 'roots.json');
    if (sequence !== pickerSequence || !dialog.open) return;
    if (page === 1) choice.replaceChildren();
    const createOption = choice.querySelector(`option[value="${newParentChoice}"]`);
    for (const item of data.items) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name_zh} · ${rankLabel(item.rank)} · ${item.scientific_name}`;
      option.dataset.rank = item.rank;
      option.dataset.name = item.name_zh;
      choice.insertBefore(option, createOption);
    }
    if (page === 1) choice.append(newParentOption());
    choice.disabled = false;
    parentPage = data.next ?? null;
    $('#parent-more').hidden = parentPage === null;
    syncParentChoice();
    $('#parent-status').textContent = data.items.length || page > 1 ? '选择已有分类继续向下；若没有合适的分类，请选列表末尾的“没有我想要的分类”。' : '这里尚无下级分类，请填写下方表单新增。';
  } catch (error) {
    if (sequence !== pickerSequence) return;
    if (page === 1) {
      choice.replaceChildren(newParentOption());
      choice.disabled = false;
      syncParentChoice();
    }
    $('#parent-status').textContent = `读取分类失败：${error.message}。新增前请确认该分类尚不存在。`;
  }
}

function refreshPicker() {
  pickerSequence++;
  updatePickerPath();
  loadPickerPage();
}

async function openContribution() {
  dialog.showModal();
  parentPath = [];
  refreshPicker();
  if (currentTaxon) {
    const sequence = pickerSequence;
    try {
      const path = await ancestorPath(currentTaxon);
      if (!dialog.open || sequence !== pickerSequence) return;
      parentPath = path;
      refreshPicker();
    } catch (error) {
      $('#parent-status').textContent = `无法预选当前分类：${error.message}`;
    }
  }
  $('#draft-panel').hidden = true;
}
document.querySelectorAll('[data-open-contribute]').forEach(button => button.addEventListener('click', openContribution));
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#parent-reset').addEventListener('click', () => { parentPath = []; refreshPicker(); });
$('#parent-undo').addEventListener('click', () => { parentPath.pop(); refreshPicker(); });
$('#parent-more').addEventListener('click', () => { if (parentPage !== null) loadPickerPage(parentPage); });
$('#parent-choice').addEventListener('change', () => {
  syncParentChoice();
  $('#parent-status').textContent = $('#parent-choice').value === newParentChoice
    ? '填写下方表单，新增这一层分类。'
    : '点击“进入所选分类”继续向下选择。';
});
$('#parent-select').addEventListener('click', () => {
  const selected = $('#parent-choice').selectedOptions[0];
  if (!selected || selected.value === newParentChoice) return;
  parentPath.push({ id: selected.value, name_zh: selected.dataset.name, rank: selected.dataset.rank, pending: false });
  refreshPicker();
});
$('#parent-add').addEventListener('click', () => {
  if (parentPath.filter(node => node.pending).length >= 8) {
    $('#parent-status').textContent = '一次投稿最多补充 8 个缺失层级。';
    return;
  }
  const name = $('#new-parent-name').value.trim();
  const scientific = $('#new-parent-scientific').value.trim();
  const description = $('#new-parent-description').value.trim();
  if (!name || !scientific || description.length < 20) {
    $('#parent-status').textContent = '新分类需要中文名、学名和至少 20 字的简介。';
    return;
  }
  parentPath.push({ pending: true, rank: parentRank.value, name_zh: name, scientific_name: scientific, description });
  $('#new-parent-name').value = '';
  $('#new-parent-scientific').value = '';
  $('#new-parent-description').value = '';
  refreshPicker();
});

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function prepareDraft() {
  const form = $('#contribute-form');
  if (!form.reportValidity()) return null;
  const data = Object.fromEntries(new FormData(form).entries());
  const ancestors = parentPath.filter(node => node.pending).map(({ rank, name_zh, scientific_name, description }) => ({ rank, name_zh, scientific_name, description }));
  const payload = {
    parent_id: [...parentPath].reverse().find(node => !node.pending)?.id ?? null,
    ancestors,
    rank: data.rank,
    name_zh: data.name_zh.trim(),
    scientific_name: data.scientific_name.trim(),
    description: data.description.trim(),
    image_url: data.image_url.trim(),
    image_credit: data.image_credit.trim(),
    source_url: data.source_url.trim()
  };
  if (payload.image_url && !payload.image_credit) {
    $('#draft-panel').hidden = false;
    $('#draft-message').textContent = '填写图片链接时，请补充图片作者和授权。';
    return null;
  }
  if ((payload.image_url && !safeHttps(payload.image_url)) || (payload.source_url && !safeHttps(payload.source_url))) {
    $('#draft-panel').hidden = false;
    $('#draft-message').textContent = '图片链接和资料来源必须使用有效的 HTTPS 地址。';
    return null;
  }
  const body = [
    '## 新分类投稿',
    `- 中文名：${payload.name_zh}`,
    `- 学名：${payload.scientific_name}`,
    `- 上级分类路径：${parentPath.length ? parentPath.map(pickerLabel).join(' → ') : '根目录'}`,
    ...ancestors.map(node => `- 同时新增：${node.name_zh}（${node.scientific_name}，${rankLabel(node.rank)}）`),
    `- 分类级别：${rankLabel(payload.rank)}`,
    payload.image_url ? `- 图片：${payload.image_url}` : '',
    payload.image_credit ? `- 图片作者及授权：${payload.image_credit}` : '',
    payload.source_url ? `- 资料来源：${payload.source_url}` : '',
    '', '### 介绍', payload.description, '',
    `<!-- BIOTA_SUBMISSION_V1\n${encodePayload(payload)}\n-->`
  ].filter(Boolean).join('\n');
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 20000 || body.length > 50000) {
    $('#draft-panel').hidden = false;
    $('#draft-message').textContent = '投稿内容过长，请缩短介绍或分多次投稿。';
    return null;
  }
  return { payload, body };
}

$('#contribute-form').addEventListener('submit', event => {
  event.preventDefault();
  const draft = prepareDraft();
  if (!draft) return;
  $('#draft-panel').hidden = false;
  $('#draft-body').value = draft.body;
  const link = $('#draft-link');
  link.hidden = true;
  if (!repositoryUrl) {
    $('#draft-message').textContent = '草稿已生成。仓库管理员配置 GitHub 数据仓库地址后，就可以从这里提交。';
    return;
  }
  const issueUrl = new URL(`${repositoryUrl}/issues/new`);
  issueUrl.searchParams.set('title', `新增分类：${draft.payload.name_zh}`);
  issueUrl.searchParams.set('body', draft.body);
  if (issueUrl.href.length <= 6000) {
    link.href = issueUrl.href;
    link.hidden = false;
    $('#draft-message').textContent = '资料已准备好。打开 GitHub 页面，登录后确认提交即可。';
    window.open(issueUrl.href, '_blank', 'noopener,noreferrer');
  } else {
    const shortUrl = new URL(`${repositoryUrl}/issues/new`);
    shortUrl.searchParams.set('title', `新增分类：${draft.payload.name_zh}`);
    link.href = shortUrl.href;
    link.hidden = false;
    $('#draft-message').textContent = '内容较长，避免 GitHub 拒绝过长网址：请先复制下方草稿，再打开 GitHub 投稿页面粘贴到正文。';
  }
});

$('#copy-draft').addEventListener('click', async () => {
  const draft = prepareDraft();
  if (!draft) return;
  $('#draft-panel').hidden = false;
  $('#draft-body').value = draft.body;
  try {
    await navigator.clipboard.writeText(draft.body);
    $('#draft-message').textContent = '投稿草稿已复制。';
  } catch {
    $('#draft-body').select();
    $('#draft-message').textContent = '请选择并复制下方投稿草稿。';
  }
});

fetchData('config.json').then(config => {
  if (typeof config.repository_url === 'string' && /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(config.repository_url)) {
    repositoryUrl = config.repository_url.replace(/\/$/, '');
  } else if (location.hostname.endsWith('.github.io')) {
    const owner = location.hostname.split('.')[0];
    repositoryUrl = `https://github.com/${owner}/biopedia-data`;
  }
}).catch(() => {});
route();
