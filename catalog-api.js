import { parseFrontMatter } from './markdown.js?v=20261017-5';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
// Both repositories are sibling project sites under the same GitHub Pages host.
// Local preview serves this directory and biota-data from the shared parent.
const dataBase = new URL(isLocal ? '../biota-data/docs/' : '../biopedia-data/', import.meta.url);
const taxonCache = new Map();

export async function fetchData(relative, kind = 'json') {
  const response = await fetch(new URL(relative, dataBase), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`图鉴数据暂时不可用（HTTP ${response.status}）`);
  return kind === 'text' ? response.text() : response.json();
}

export async function fetchTaxon(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('分类编号无效');
  if (!taxonCache.has(id)) {
    taxonCache.set(id, fetchData(`taxa/${id}.md`, 'text').then(parseFrontMatter).catch(error => {
      taxonCache.delete(id);
      throw error;
    }));
  }
  return taxonCache.get(id);
}

export async function ancestorPath(taxon) {
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
