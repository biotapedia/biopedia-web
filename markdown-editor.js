import { renderMarkdown } from './markdown.js?v=20261017-5';
import { safeHttps } from './taxonomy.js';

export function initMarkdownEditor() {
  const textarea = document.querySelector('#description-editor');
  const preview = document.querySelector('#markdown-preview');
  const previewButton = document.querySelector('#markdown-preview-toggle');
  const linkPanel = document.querySelector('#markdown-link-panel');
  const imagePanel = document.querySelector('#markdown-image-panel');
  const linkButton = document.querySelector('#markdown-link-toggle');
  const imageButton = document.querySelector('#markdown-image-toggle');
  let insertion = { start: 0, end: 0 };

  function updatePreview() {
    if (preview.hidden) return;
    preview.replaceChildren();
    if (textarea.value.trim()) preview.append(renderMarkdown(textarea.value));
    else preview.textContent = '填写介绍后，这里会显示排版效果。';
  }

  function changed() {
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  }

  function insert(start, end, content, selectionStart, selectionEnd = selectionStart) {
    textarea.setRangeText(content, start, end, 'end');
    changed();
    textarea.setSelectionRange(selectionStart, selectionEnd);
  }

  function wrap(mark, placeholder) {
    const { selectionStart: start, selectionEnd: end } = textarea;
    const content = textarea.value.slice(start, end) || placeholder;
    insert(start, end, `${mark}${content}${mark}`, start + mark.length, start + mark.length + content.length);
  }

  function prefixLines(prefix) {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const selectedEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const nextBreak = value.indexOf('\n', selectedEnd);
    const lineEnd = nextBreak < 0 ? value.length : nextBreak;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const formatted = lines.map((line, index) => {
      const plain = line.replace(/^(?:#{1,3}|[-*+]|\d+[.)]|>)\s+/, '');
      return prefix === '1. ' ? `${index + 1}. ${plain}` : `${prefix}${plain}`;
    }).join('\n');
    const caret = end > start ? lineStart : lineStart + formatted.length;
    insert(lineStart, lineEnd, formatted, caret, end > start ? lineStart + formatted.length : caret);
  }

  function closePanels() {
    linkPanel.hidden = true;
    imagePanel.hidden = true;
    linkButton.setAttribute('aria-expanded', 'false');
    imageButton.setAttribute('aria-expanded', 'false');
  }

  function openPanel(panel, button) {
    insertion = { start: textarea.selectionStart, end: textarea.selectionEnd };
    const selected = textarea.value.slice(insertion.start, insertion.end).trim();
    closePanels();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    panel.querySelector('[data-editor-status]').textContent = '';
    if (panel === linkPanel && selected) panel.querySelector('#markdown-link-text').value = selected;
    if (panel === imagePanel && selected) panel.querySelector('#markdown-image-alt').value = selected;
    panel.querySelector('input').focus();
  }

  document.querySelectorAll('[data-md-wrap]').forEach(button => {
    button.addEventListener('click', () => wrap(button.dataset.mdWrap, button.dataset.placeholder));
  });
  document.querySelectorAll('[data-md-prefix]').forEach(button => {
    button.addEventListener('click', () => prefixLines(button.dataset.mdPrefix));
  });
  linkButton.addEventListener('click', () => openPanel(linkPanel, linkButton));
  imageButton.addEventListener('click', () => openPanel(imagePanel, imageButton));
  document.querySelectorAll('[data-editor-cancel]').forEach(button => {
    button.addEventListener('click', () => { closePanels(); textarea.focus(); });
  });

  linkPanel.querySelector('[data-editor-insert]').addEventListener('click', () => {
    const label = linkPanel.querySelector('#markdown-link-text').value.trim().replace(/[\[\]\r\n]/g, '');
    const url = safeHttps(linkPanel.querySelector('#markdown-link-url').value.trim());
    if (!label || !url) {
      linkPanel.querySelector('[data-editor-status]').textContent = '请填写链接文字和有效的 HTTPS 地址。';
      return;
    }
    const syntax = `[${label}](${url.replaceAll('(', '%28').replaceAll(')', '%29')})`;
    insert(insertion.start, insertion.end, syntax, insertion.start + syntax.length);
    linkPanel.querySelectorAll('input').forEach(input => { input.value = ''; });
    closePanels();
  });

  imagePanel.querySelector('[data-editor-insert]').addEventListener('click', () => {
    const alt = imagePanel.querySelector('#markdown-image-alt').value.trim().replace(/[\[\]\r\n]/g, '');
    const credit = imagePanel.querySelector('#markdown-image-credit').value.trim().replace(/[\r\n*_]/g, ' ');
    const url = safeHttps(imagePanel.querySelector('#markdown-image-url').value.trim());
    if (!alt || !credit || !url) {
      imagePanel.querySelector('[data-editor-status]').textContent = '请填写图片说明、作者及授权，以及有效的 HTTPS 图片地址。';
      return;
    }
    const before = textarea.value.slice(0, insertion.start);
    const after = textarea.value.slice(insertion.end);
    const lead = before && !before.endsWith('\n\n') ? before.endsWith('\n') ? '\n' : '\n\n' : '';
    const trail = after && !after.startsWith('\n\n') ? after.startsWith('\n') ? '\n' : '\n\n' : '';
    const syntax = `${lead}![${alt}](${url.replaceAll('(', '%28').replaceAll(')', '%29')})\n\n*图片作者及授权：${credit}*${trail}`;
    insert(insertion.start, insertion.end, syntax, insertion.start + syntax.length);
    imagePanel.querySelectorAll('input').forEach(input => { input.value = ''; });
    closePanels();
  });

  previewButton.addEventListener('click', () => {
    preview.hidden = !preview.hidden;
    previewButton.setAttribute('aria-pressed', String(!preview.hidden));
    updatePreview();
  });
  textarea.addEventListener('input', updatePreview);
}
