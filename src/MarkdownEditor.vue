<script setup>
import { nextTick, ref, watch } from 'vue';
import { renderMarkdown } from '../markdown.js';
import { safeHttps } from '../taxonomy.js';

const model = defineModel({ type: String, default: '' });
const textarea = ref(null);
const preview = ref(null);
const previewOpen = ref(false);
const panel = ref('');
const insertion = ref({ start: 0, end: 0 });
const label = ref('');
const url = ref('');
const credit = ref('');
const message = ref('');

function updatePreview() {
  if (!previewOpen.value || !preview.value) return;
  preview.value.replaceChildren();
  if (model.value.trim()) preview.value.append(renderMarkdown(model.value));
  else preview.value.textContent = '填写介绍后，这里会显示排版效果。';
}
watch([model, previewOpen], () => nextTick(updatePreview));

function insert(start, end, content, selectionStart, selectionEnd = selectionStart) {
  textarea.value.setRangeText(content, start, end, 'end');
  model.value = textarea.value.value;
  nextTick(() => {
    textarea.value.focus();
    textarea.value.setSelectionRange(selectionStart, selectionEnd);
  });
}
function wrap(mark, placeholder) {
  const { selectionStart: start, selectionEnd: end, value } = textarea.value;
  const content = value.slice(start, end) || placeholder;
  insert(start, end, `${mark}${content}${mark}`, start + mark.length, start + mark.length + content.length);
}
function prefixLines(prefix) {
  const { selectionStart: start, selectionEnd: end, value } = textarea.value;
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const selectedEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = value.indexOf('\n', selectedEnd);
  const lineEnd = nextBreak < 0 ? value.length : nextBreak;
  const formatted = value.slice(lineStart, lineEnd).split('\n').map((line, index) => {
    const plain = line.replace(/^(?:#{1,3}|[-*+]|\d+[.)]|>)\s+/, '');
    return prefix === '1. ' ? `${index + 1}. ${plain}` : `${prefix}${plain}`;
  }).join('\n');
  const caret = end > start ? lineStart : lineStart + formatted.length;
  insert(lineStart, lineEnd, formatted, caret, end > start ? lineStart + formatted.length : caret);
}
function openPanel(kind) {
  insertion.value = { start: textarea.value.selectionStart, end: textarea.value.selectionEnd };
  label.value = textarea.value.value.slice(insertion.value.start, insertion.value.end).trim();
  url.value = '';
  credit.value = '';
  message.value = '';
  panel.value = kind;
}
function insertLink() {
  const cleanLabel = label.value.trim().replace(/[\[\]\r\n]/g, '');
  const cleanUrl = safeHttps(url.value.trim());
  if (!cleanLabel || !cleanUrl) { message.value = '请填写链接文字和有效的 HTTPS 地址。'; return; }
  const syntax = `[${cleanLabel}](${cleanUrl.replaceAll('(', '%28').replaceAll(')', '%29')})`;
  insert(insertion.value.start, insertion.value.end, syntax, insertion.value.start + syntax.length);
  panel.value = '';
}
function insertImage() {
  const alt = label.value.trim().replace(/[\[\]\r\n]/g, '');
  const attribution = credit.value.trim().replace(/[\r\n*_]/g, ' ');
  const cleanUrl = safeHttps(url.value.trim());
  if (!alt || !attribution || !cleanUrl) { message.value = '请填写图片说明、作者及授权，以及有效的 HTTPS 图片地址。'; return; }
  const before = textarea.value.value.slice(0, insertion.value.start);
  const after = textarea.value.value.slice(insertion.value.end);
  const lead = before && !before.endsWith('\n\n') ? before.endsWith('\n') ? '\n' : '\n\n' : '';
  const trail = after && !after.startsWith('\n\n') ? after.startsWith('\n') ? '\n' : '\n\n' : '';
  const syntax = `${lead}![${alt}](${cleanUrl.replaceAll('(', '%28').replaceAll(')', '%29')})\n\n*图片作者及授权：${attribution}*${trail}`;
  insert(insertion.value.start, insertion.value.end, syntax, insertion.value.start + syntax.length);
  panel.value = '';
}
</script>

<template>
  <div class="form-field form-wide markdown-field">
    <label for="description-editor">介绍与特征 *</label>
    <div class="markdown-editor">
      <div class="markdown-toolbar" role="toolbar" aria-label="介绍与特征格式工具">
        <wa-button appearance="plain" size="s" type="button" title="标题" @click="prefixLines('## ')">标题</wa-button>
        <wa-button appearance="plain" size="s" type="button" title="小标题" @click="prefixLines('### ')">小标题</wa-button>
        <wa-button appearance="plain" size="s" type="button" title="加粗" @click="wrap('**', '加粗文字')"><strong>B</strong></wa-button>
        <wa-button appearance="plain" size="s" type="button" title="斜体" @click="wrap('*', '斜体文字')"><em>I</em></wa-button>
        <wa-button appearance="plain" size="s" type="button" title="无序列表" @click="prefixLines('- ')">• 列表</wa-button>
        <wa-button appearance="plain" size="s" type="button" title="有序列表" @click="prefixLines('1. ')">1. 列表</wa-button>
        <wa-button appearance="plain" size="s" type="button" :aria-expanded="panel === 'link'" aria-controls="markdown-link-panel" @click="openPanel('link')">插入链接</wa-button>
        <wa-button appearance="plain" size="s" type="button" :aria-expanded="panel === 'image'" aria-controls="markdown-image-panel" @click="openPanel('image')">插入图片</wa-button>
        <wa-button appearance="plain" size="s" type="button" :aria-pressed="previewOpen" aria-controls="markdown-preview" @click="previewOpen = !previewOpen">预览</wa-button>
      </div>
      <textarea id="description-editor" ref="textarea" v-model="model" name="description" minlength="20" maxlength="10000" required rows="9" placeholder="描述形态、栖息地、分布等。"></textarea>
    </div>
    <div v-if="panel === 'link'" id="markdown-link-panel" class="editor-insert-panel">
      <strong>插入链接</strong>
      <wa-input label="显示文字" :value.prop="label" placeholder="例如：资料来源" @input="label = $event.target.value"></wa-input>
      <wa-input label="HTTPS 链接" :value.prop="url" type="url" placeholder="https://example.org/source" @input="url = $event.target.value"></wa-input>
      <p role="status">{{ message }}</p>
      <div class="editor-insert-actions"><wa-button appearance="outlined" size="s" type="button" @click="panel = ''">取消</wa-button><wa-button appearance="filled" variant="brand" size="s" type="button" @click="insertLink">插入链接</wa-button></div>
    </div>
    <div v-if="panel === 'image'" id="markdown-image-panel" class="editor-insert-panel">
      <strong>插入正文图片</strong>
      <wa-input label="图片说明" :value.prop="label" placeholder="例如：毒鹅膏的菌盖" @input="label = $event.target.value"></wa-input>
      <wa-input label="图片外链（HTTPS）" :value.prop="url" type="url" placeholder="https://example.org/photo.jpg" @input="url = $event.target.value"></wa-input>
      <wa-input label="图片作者及授权" :value.prop="credit" placeholder="例如：张三，CC BY 4.0" @input="credit = $event.target.value"></wa-input>
      <p role="status">{{ message }}</p>
      <div class="editor-insert-actions"><wa-button appearance="outlined" size="s" type="button" @click="panel = ''">取消</wa-button><wa-button appearance="filled" variant="brand" size="s" type="button" @click="insertImage">插入图片</wa-button></div>
    </div>
    <div v-show="previewOpen" id="markdown-preview" ref="preview" class="markdown-preview prose" aria-label="介绍与特征预览"></div>
  </div>
</template>
