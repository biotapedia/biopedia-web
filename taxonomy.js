export const rankNames = {
  domain: '域', kingdom: '界', subkingdom: '亚界', phylum: '门', subphylum: '亚门',
  class: '纲', subclass: '亚纲', order: '目', suborder: '亚目', family: '科',
  subfamily: '亚科', tribe: '族', genus: '属', subgenus: '亚属', species: '种',
  subspecies: '亚种', variety: '变种', form: '变型', clade: '演化支', unranked: '未定级'
};

export const nextRank = {
  kingdom: 'phylum', phylum: 'class', class: 'order', order: 'family',
  suborder: 'family', family: 'genus', genus: 'species', species: 'subspecies'
};

export function rankLabel(rank) { return rankNames[rank] || rank; }

export function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
