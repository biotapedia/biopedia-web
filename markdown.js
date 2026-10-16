// Render a small Markdown subset with DOM nodes. Taxon text is community supplied,
// so it is never inserted with innerHTML or allowed to create script URLs.
export function parseFrontMatter(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('条目缺少元数据');
  const metadata = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const pair = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!pair) throw new Error('条目元数据格式错误');
    metadata[pair[1]] = JSON.parse(pair[2]);
  }
  return { ...metadata, body: match[2].trim() };
}

function appendInline(parent, source) {
  const pattern = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    parent.append(document.createTextNode(source.slice(cursor, match.index)));
    if (match[1]) {
      const link = document.createElement('a');
      link.href = match[2];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = match[1];
      parent.append(link);
    } else {
      const strong = document.createElement('strong');
      strong.textContent = match[3];
      parent.append(strong);
    }
    cursor = match.index + match[0].length;
  }
  parent.append(document.createTextNode(source.slice(cursor)));
}

export function renderMarkdown(source) {
  const fragment = document.createDocumentFragment();
  const blocks = source.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const heading = block.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const element = document.createElement(`h${Math.min(heading[1].length + 2, 5)}`);
      appendInline(element, heading[2]);
      fragment.append(element);
    } else if (block.split('\n').every(line => /^[-*]\s+/.test(line))) {
      const list = document.createElement('ul');
      for (const line of block.split('\n')) {
        const item = document.createElement('li');
        appendInline(item, line.replace(/^[-*]\s+/, ''));
        list.append(item);
      }
      fragment.append(list);
    } else {
      const paragraph = document.createElement('p');
      appendInline(paragraph, block.replace(/\n/g, ' '));
      fragment.append(paragraph);
    }
  }
  return fragment;
}
