import { rankLabel } from './taxonomy.js';
import { renderPath, renderCard, renderTaxonDetail } from './catalog-components.js';
import { fetchData, fetchTaxon, ancestorPath } from './catalog-api.js';

const $ = selector => document.querySelector(selector);
let currentTaxon = null;
let currentItems = [];
let nextPage = null;
let renderSequence = 0;

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

function updateContributionLinks(id = null) {
  const href = `./contribute.html${id ? `?parent=${encodeURIComponent(id)}` : ''}`;
  document.querySelectorAll('[data-contribute-link]').forEach(link => { link.href = href; });
}

async function renderHome(sequence) {
  currentTaxon = null;
  updateContributionLinks();
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
  updateContributionLinks(taxon.id);
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
route();
