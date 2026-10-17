import { renderMarkdown } from './markdown.js?v=20261017-5';
import { rankLabel, safeHttps } from './taxonomy.js';

export function makeText(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

export function renderPath(taxa) {
  const nav = document.querySelector('#path-nav');
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

export function renderCard(item, index) {
  const link = document.createElement('a');
  link.className = 'taxon-link';
  link.href = `#/taxon/${item.id}`;
  link.setAttribute('aria-label', `${rankLabel(item.rank)}：${item.name_zh}，${item.scientific_name}${item.child_count ? `，${item.child_count} 个下级分类` : ''}`);
  link.dataset.search = `${item.name_zh} ${item.scientific_name}`.toLocaleLowerCase();
  const card = document.createElement('wa-card');
  card.className = 'taxon-card';
  card.setAttribute('appearance', 'plain');
  const top = makeText('div', 'card-top', '');
  const badge = makeText('span', 'card-rank', rankLabel(item.rank));
  top.append(badge, makeText('span', 'card-index', String(index + 1).padStart(2, '0')));
  const body = makeText('div', 'card-body', '');
  body.append(makeText('h3', '', item.name_zh), makeText('p', 'latin-name', item.scientific_name));
  const bottom = makeText('div', 'card-bottom', '');
  bottom.append(makeText('span', '', item.child_count ? `${item.child_count} 个下级分类` : '查看详情'), makeText('span', 'card-arrow', '↗'));
  const inner = makeText('div', 'taxon-card-inner', '');
  inner.append(top, body, bottom);
  card.append(inner);
  link.append(card);
  return link;
}

export function renderTaxonDetail(taxon) {
  const article = document.createElement('article');
  article.className = 'taxon-detail';
  const copy = makeText('div', 'detail-copy', '');
  const rank = makeText('div', 'detail-rank', '');
  const badge = makeText('span', 'detail-rank-badge', rankLabel(taxon.rank));
  rank.append(badge, makeText('span', '', taxon.id));
  copy.append(rank, makeText('h2', 'detail-title', taxon.name_zh));
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
  visual.append(makeText('span', 'visual-label', taxon.image_credit || '生命之树 / BIOTAPEDIA'));
  article.append(copy, visual);
  document.querySelector('#detail').replaceChildren(article);
}
