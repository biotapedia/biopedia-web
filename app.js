import { parseFrontMatter, renderMarkdown } from './markdown.js';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// Both repositories are sibling project sites under the same GitHub Pages host.
// Local preview serves this directory and biota-data from the shared parent.
const dataBase = new URL(isLocal ? '../biota-data/docs/' : '../biota-data/', import.meta.url);
const rankNames = {
  domain: '域', kingdom: '界', subkingdom: '亚界', phylum: '门', subphylum: '亚门',
  class: '纲', subclass: '亚纲', order: '目', suborder: '亚目', family: '科',
  subfamily: '亚科', tribe: '族', genus: '属', subgenus: '亚属', species: '种',
  subspecies: '亚种', variety: '变种', form: '变型', clade: '演化支', unranked: '未定级'
};
const nextRank = {
  kingdom: 'phylum', phylum: 'class', class: 'order', order: 'family',
  suborder: 'family', family: 'genus', genus: 'species', species: 'subspecies'
};
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

function rankLabel(rank) { return rankNames[rank] || rank; }
function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
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

function makeText(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderPath(taxa) {
  const nav = $('#path-nav');
  nav.replaceChildren();
  const home = document.createElement('a');
  home.href = '#/';
  home.className = taxa.length ? 'path-item' : 'path-item active';
  home.append(makeText('span', 'path-bullet', '◎'), makeText('span', '', '全部分类'));
  nav.append(home);
  for (const [index, taxon] of taxa.entries()) {
    const link = document.createElement('a');
    link.href = `#/taxon/${taxon.id}`;
    link.className = `path-item ${index === taxa.length - 1 ? 'active' : ''}`;
    link.style.setProperty('--path-depth', String(index + 1));
    link.append(makeText('span', 'path-bullet', '↳'), makeText('span', '', taxon.name_zh));
    nav.append(link);
  }
}

function renderCard(item, index) {
  const link = document.createElement('a');
  link.className = 'taxon-card';
  link.href = `#/taxon/${item.id}`;
  link.dataset.search = `${item.name_zh} ${item.scientific_name}`.toLocaleLowerCase();
  const top = makeText('div', 'card-top', '');
  top.append(makeText('span', 'card-rank', rankLabel(item.rank)), makeText('span', 'card-index', String(index + 1).padStart(2, '0')));
  const text = makeText('div', 'card-body', '');
  text.append(makeText('h3', '', item.name_zh), makeText('p', 'latin-name', item.scientific_name));
  const bottom = makeText('div', 'card-bottom', '');
  bottom.append(makeText('span', '', item.child_count ? `${item.child_count} 个下级分类` : '查看详情'), makeText('span', 'card-arrow', '↗'));
  link.append(top, text, bottom);
  return link;
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

function renderTaxonDetail(taxon) {
  const article = document.createElement('article');
  article.className = 'taxon-detail';
  const copy = makeText('div', 'detail-copy', '');
  copy.append(makeText('div', 'detail-rank', `${rankLabel(taxon.rank)} / ${taxon.id}`));
  copy.append(makeText('h2', 'detail-title', taxon.name_zh));
  copy.append(makeText('p', 'detail-latin', taxon.scientific_name));
  const body = makeText('div', 'prose', '');
  body.append(renderMarkdown(taxon.body));
  copy.append(body);
  const source = safeHttps(taxon.source_url);
  if (source) {
    const citation = document.createElement('a');
    citation.className = 'source-link';
    citation.href = source;
    citation.target = '_blank';
    citation.rel = 'noopener noreferrer';
    citation.textContent = '查看资料来源 ↗';
    copy.append(citation);
  }
  const visual = makeText('div', 'detail-visual', '');
  const photo = safeHttps(taxon.image_url);
  if (photo) {
    const image = document.createElement('img');
    image.src = photo;
    image.alt = taxon.name_zh;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove());
    visual.append(image);
  }
  visual.append(makeText('span', 'visual-glyph', '✳'));
  visual.append(makeText('span', 'visual-label', taxon.image_credit || '生命之树 / BIOTA'));
  article.append(copy, visual);
  $('#detail').replaceChildren(article);
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
function openContribution() {
  $('#form-parent-label').value = currentTaxon ? `${currentTaxon.name_zh} · ${rankLabel(currentTaxon.rank)}` : '图鉴根目录';
  const suggested = currentTaxon ? nextRank[currentTaxon.rank] : 'kingdom';
  $('[name="rank"]').value = suggested || 'unranked';
  $('#draft-panel').hidden = true;
  dialog.showModal();
}
document.querySelectorAll('[data-open-contribute]').forEach(button => button.addEventListener('click', openContribution));
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

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
  const payload = {
    parent_id: currentTaxon?.id ?? null,
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
    `- 上级分类：${payload.parent_id || '根目录'}`,
    `- 分类级别：${rankLabel(payload.rank)}`,
    payload.image_url ? `- 图片：${payload.image_url}` : '',
    payload.image_credit ? `- 图片作者及授权：${payload.image_credit}` : '',
    payload.source_url ? `- 资料来源：${payload.source_url}` : '',
    '', '### 介绍', payload.description, '',
    `<!-- BIOTA_SUBMISSION_V1\n${encodePayload(payload)}\n-->`
  ].filter(Boolean).join('\n');
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
    repositoryUrl = `https://github.com/${owner}/biota-data`;
  }
}).catch(() => {});
route();
