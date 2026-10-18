// Distribution regions: TDWG WGSRPD levels 1–2 on land, FAO major fishing areas at sea.
// Leaves match feature ids in assets/regions.topo.json; parent shapes are merged from their leaves.
// Land shapes are Natural Earth countries (China point of view) grouped into these regions by scripts/build-regions.mjs,
// so China (tdwg-36) includes Taiwan, Hong Kong and Macao.
// biota-data/scripts/regions.json mirrors these ids and parents for validation; keep them in sync.
const land = [
  ['tdwg-1', '欧洲', [['tdwg-10', '北欧'], ['tdwg-11', '中欧'], ['tdwg-12', '西南欧'], ['tdwg-13', '东南欧'], ['tdwg-14', '东欧']]],
  ['tdwg-2', '非洲', [
    ['tdwg-20', '北非'], ['tdwg-21', '马卡罗尼西亚'], ['tdwg-22', '西热带非洲'], ['tdwg-23', '中西热带非洲'],
    ['tdwg-24', '东北热带非洲'], ['tdwg-25', '东热带非洲'], ['tdwg-26', '南热带非洲'], ['tdwg-27', '南部非洲'],
    ['tdwg-28', '中大西洋岛屿'], ['tdwg-29', '西印度洋岛屿']
  ]],
  ['tdwg-3', '温带亚洲', [
    ['tdwg-30', '西伯利亚'], ['tdwg-31', '俄罗斯远东'], ['tdwg-32', '中亚'], ['tdwg-33', '高加索'], ['tdwg-34', '西亚'],
    ['tdwg-35', '阿拉伯半岛'], ['tdwg-36', '中国'], ['tdwg-37', '蒙古'], ['tdwg-38', '日本与朝鲜半岛']
  ]],
  ['tdwg-4', '热带亚洲', [['tdwg-40', '印度次大陆'], ['tdwg-41', '中南半岛'], ['tdwg-42', '马来群岛'], ['tdwg-43', '巴布亚区']]],
  ['tdwg-5', '澳大拉西亚', [['tdwg-50', '澳大利亚'], ['tdwg-51', '新西兰']]],
  ['tdwg-6', '太平洋岛屿', [['tdwg-60', '西南太平洋岛屿'], ['tdwg-61', '中南太平洋岛屿'], ['tdwg-62', '西北太平洋岛屿'], ['tdwg-63', '中北太平洋岛屿']]],
  ['tdwg-7', '北美洲', [
    ['tdwg-70', '亚北极美洲'], ['tdwg-71', '加拿大西部'], ['tdwg-72', '加拿大东部'], ['tdwg-73', '美国西北部'], ['tdwg-74', '美国中北部'],
    ['tdwg-75', '美国东北部'], ['tdwg-76', '美国西南部'], ['tdwg-77', '美国中南部'], ['tdwg-78', '美国东南部'], ['tdwg-79', '墨西哥']
  ]],
  ['tdwg-8', '中南美洲', [
    ['tdwg-80', '中美洲'], ['tdwg-81', '加勒比'], ['tdwg-82', '南美洲北部'], ['tdwg-83', '南美洲西部'], ['tdwg-84', '巴西'], ['tdwg-85', '南美洲南部']
  ]],
  ['tdwg-9', '南极洲', [['tdwg-90', '亚南极群岛'], ['tdwg-91', '南极大陆']]]
];

const sea = [
  ['fao-18', '北冰洋'],
  ['ocean-atlantic', '大西洋', [
    ['fao-21', '西北大西洋'], ['fao-27', '东北大西洋'], ['fao-31', '中西大西洋'], ['fao-34', '中东大西洋'],
    ['fao-37', '地中海和黑海'], ['fao-41', '西南大西洋'], ['fao-47', '东南大西洋']
  ]],
  ['ocean-indian', '印度洋', [['fao-51', '西印度洋'], ['fao-57', '东印度洋']]],
  ['ocean-pacific', '太平洋', [
    ['fao-61', '西北太平洋'], ['fao-67', '东北太平洋'], ['fao-71', '中西太平洋'], ['fao-77', '中东太平洋'], ['fao-81', '西南太平洋'], ['fao-87', '东南太平洋']
  ]],
  ['ocean-southern', '南大洋', [['fao-48', '大西洋南极海区'], ['fao-58', '印度洋南极海区'], ['fao-88', '太平洋南极海区']]]
];

export const regionIndex = new Map();

function build([id, name, children = []], kind, parent) {
  const node = { id, name, kind, parent, children: [] };
  regionIndex.set(id, node);
  node.children = children.map(child => build(child, kind, node));
  return node;
}

export const regionTree = [...land.map(item => build(item, 'land', null)), ...sea.map(item => build(item, 'sea', null))];

export function regionLeaves(id) {
  const node = regionIndex.get(id);
  if (!node) return [];
  return node.children.length ? node.children.flatMap(child => regionLeaves(child.id)) : [node];
}

export function regionPath(id) {
  const path = [];
  for (let node = regionIndex.get(id); node; node = node.parent) path.unshift(node);
  return path;
}

// Reduces any selection to the fewest ids: a region whose leaves are all selected replaces them.
export function normalizeRegions(ids) {
  const leaves = new Set(ids.flatMap(id => regionLeaves(id)).map(node => node.id));
  const collect = node => regionLeaves(node.id).every(leaf => leaves.has(leaf.id)) ? [node.id] : node.children.flatMap(collect);
  return regionTree.flatMap(collect);
}

export function toggleRegionLeaf(ids, leafId) {
  const leaves = new Set(ids.flatMap(id => regionLeaves(id)).map(node => node.id));
  if (!leaves.delete(leafId)) leaves.add(leafId);
  return normalizeRegions([...leaves]);
}
