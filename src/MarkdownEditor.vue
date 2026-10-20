<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { Bold, Code, FileCode, Heading2, Heading3, ImagePlus, Italic, Link, List, ListOrdered, Redo2, TextQuote, Undo2 } from '@lucide/vue';
import { safeHttps } from '../taxonomy.js';
import { cleanLabel, looksLikeMarkdown, markdownUrl, richMarkdownExtensions } from './rich-markdown.js';

const model = defineModel({ type: String, default: '' });
const sourceMode = ref(false);
const source = ref(null);
const panel = ref('');
const field = ref(null);
const linkButton = ref(null);
const imageButton = ref(null);
const panelElement = ref(null);
const panelStyle = ref({});
const insertion = ref({ from: 0, to: 0 });
const editingLink = ref(false);
const label = ref('');
const url = ref('');
const credit = ref('');
const message = ref('');
let lastMarkdown = model.value;

const editor = useEditor({
  content: model.value,
  contentType: 'markdown',
  extensions: richMarkdownExtensions('描述形态、栖息地、分布等。可以直接输入 # 标题、- 列表、**加粗** 等 Markdown 写法。'),
  editorProps: {
    attributes: { id: 'description-editor', class: 'markdown-rich prose', role: 'textbox', 'aria-multiline': 'true', 'aria-required': 'true', 'aria-labelledby': 'description-label' },
    handleKeyDown(view, event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false;
      event.preventDefault();
      openPanel('link');
      return true;
    },
    handlePaste(view, event) {
      const text = event.clipboardData?.getData('text/plain');
      if (!text || event.clipboardData.getData('text/html') || editor.value.isActive('codeBlock') || !looksLikeMarkdown(text)) return false;
      editor.value.commands.insertContent(text, { contentType: 'markdown' });
      return true;
    }
  },
  onUpdate({ editor }) {
    lastMarkdown = editor.getMarkdown();
    model.value = lastMarkdown;
  }
});
onMounted(() => {
  document.addEventListener('pointerdown', dismissPanel);
  document.addEventListener('keydown', dismissPanelOnEscape);
  window.addEventListener('resize', positionPanel);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissPanel);
  document.removeEventListener('keydown', dismissPanelOnEscape);
  window.removeEventListener('resize', positionPanel);
  editor.value?.destroy();
});

watch(model, value => {
  if (sourceMode.value || !editor.value || value === lastMarkdown) return;
  lastMarkdown = value;
  editor.value.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
});

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const hint = (name, keys) => keys ? `${name}（${keys.split('-').map(key => ({ Mod: isMac ? '⌘' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift' })[key] ?? key).join(isMac ? '' : '+')}）` : name;
const toolGroups = [
  [
    { name: '撤销', keys: 'Mod-Z', icon: Undo2, run: chain => chain.undo(), enabled: e => e.can().undo() },
    { name: '重做', keys: 'Mod-Shift-Z', icon: Redo2, run: chain => chain.redo(), enabled: e => e.can().redo() }
  ],
  [
    { name: '标题', icon: Heading2, run: chain => chain.toggleHeading({ level: 2 }), active: e => e.isActive('heading', { level: 2 }) },
    { name: '小标题', icon: Heading3, run: chain => chain.toggleHeading({ level: 3 }), active: e => e.isActive('heading', { level: 3 }) }
  ],
  [
    { name: '加粗', keys: 'Mod-B', icon: Bold, run: chain => chain.toggleBold(), active: e => e.isActive('bold') },
    { name: '斜体', keys: 'Mod-I', icon: Italic, run: chain => chain.toggleItalic(), active: e => e.isActive('italic') },
    { name: '行内代码', keys: 'Mod-E', icon: Code, run: chain => chain.toggleCode(), active: e => e.isActive('code') }
  ],
  [
    { name: '无序列表', keys: 'Mod-Shift-8', icon: List, run: chain => chain.toggleBulletList(), active: e => e.isActive('bulletList') },
    { name: '有序列表', keys: 'Mod-Shift-7', icon: ListOrdered, run: chain => chain.toggleOrderedList(), active: e => e.isActive('orderedList') },
    { name: '引用', keys: 'Mod-Shift-B', icon: TextQuote, run: chain => chain.toggleBlockquote(), active: e => e.isActive('blockquote') }
  ]
];
function runTool(tool) { tool.run(editor.value.chain().focus()).run(); }

function toggleSource() {
  panel.value = '';
  if (sourceMode.value) {
    lastMarkdown = model.value;
    editor.value.commands.setContent(model.value, { contentType: 'markdown' });
    sourceMode.value = false;
    nextTick(() => editor.value.commands.focus('end'));
  } else {
    sourceMode.value = true;
    nextTick(() => source.value.focus());
  }
}

function positionPanel() {
  const trigger = (panel.value === 'image' ? imageButton : linkButton).value;
  if (!trigger || !field.value) return;
  const fieldRect = field.value.getBoundingClientRect();
  const buttonRect = trigger.getBoundingClientRect();
  const width = Math.min(380, fieldRect.width, window.innerWidth - 24);
  const left = Math.max(0, Math.min(buttonRect.left - fieldRect.left, fieldRect.width - width));
  panelStyle.value = {
    top: `${buttonRect.bottom - fieldRect.top + 8}px`,
    left: `${left}px`,
    width: `${width}px`
  };
}
function dismissPanel(event) {
  if (!panel.value || panelElement.value?.contains(event.target) ||
    linkButton.value?.contains(event.target) || imageButton.value?.contains(event.target)) return;
  panel.value = '';
}
function dismissPanelOnEscape(event) {
  if (event.key !== 'Escape' || !panel.value) return;
  event.preventDefault();
  closePanel();
}
function openPanel(kind) {
  if (panel.value === kind) { closePanel(); return; }
  const current = editor.value;
  editingLink.value = kind === 'link' && current.isActive('link');
  if (editingLink.value) current.chain().extendMarkRange('link').run();
  const { from, to } = current.state.selection;
  insertion.value = { from, to };
  label.value = current.state.doc.textBetween(from, to, ' ').trim();
  url.value = editingLink.value ? current.getAttributes('link').href ?? '' : '';
  credit.value = '';
  message.value = '';
  panel.value = kind;
  nextTick(positionPanel);
}
function closePanel() {
  panel.value = '';
  editor.value.chain().focus().setTextSelection(insertion.value).run();
}
function insertLink() {
  const text = cleanLabel(label.value);
  const href = safeHttps(url.value.trim());
  if (!text || !href) { message.value = '请填写链接文字和有效的 HTTPS 地址。'; return; }
  editor.value.chain().focus().insertContentAt(insertion.value, { type: 'text', text, marks: [{ type: 'link', attrs: { href: markdownUrl(href) } }] }).run();
  panel.value = '';
}
function removeLink() {
  editor.value.chain().focus().setTextSelection(insertion.value).unsetLink().run();
  panel.value = '';
}
function insertImage() {
  const alt = cleanLabel(label.value);
  const attribution = credit.value.trim().replace(/[\r\n]/g, ' ');
  const src = safeHttps(url.value.trim());
  if (!alt || !attribution || !src) { message.value = '请填写图片说明、作者及授权，以及有效的 HTTPS 图片地址。'; return; }
  editor.value.chain().focus().insertContentAt(insertion.value, [
    { type: 'paragraph', content: [{ type: 'image', attrs: { src: markdownUrl(src), alt } }] },
    { type: 'paragraph', content: [{ type: 'text', text: `图片作者及授权：${attribution}`, marks: [{ type: 'italic' }] }] }
  ]).run();
  panel.value = '';
}
</script>

<template>
  <div ref="field" class="form-field form-wide markdown-field">
    <label id="description-label" :for="sourceMode ? 'description-source' : undefined" @click="!sourceMode && editor?.commands.focus()">介绍与特征 *</label>
    <div class="markdown-editor">
      <div class="markdown-toolbar" role="toolbar" aria-label="介绍与特征格式工具">
        <template v-for="(group, index) in toolGroups" :key="index">
          <button
            v-for="tool in group" :key="tool.name" type="button" :title="hint(tool.name, tool.keys)" :aria-label="tool.name"
            :aria-pressed="tool.active ? Boolean(editor && !sourceMode && tool.active(editor)) : undefined"
            :disabled="!editor || sourceMode || (tool.enabled && !tool.enabled(editor))"
            @mousedown.prevent @click="runTool(tool)"
          ><component :is="tool.icon" :size="17" :stroke-width="2.2" /></button>
          <span class="toolbar-divider" aria-hidden="true"></span>
        </template>
        <button ref="linkButton" type="button" :title="hint('插入链接', 'Mod-K')" aria-label="插入链接" :aria-pressed="Boolean(editor && !sourceMode && editor.isActive('link'))" :aria-expanded="panel === 'link'" aria-controls="markdown-link-panel" :disabled="!editor || sourceMode" @mousedown.prevent @click="openPanel('link')"><Link :size="17" :stroke-width="2.2" /></button>
        <button ref="imageButton" type="button" title="插入图片" aria-label="插入图片" :aria-expanded="panel === 'image'" aria-controls="markdown-image-panel" :disabled="!editor || sourceMode" @mousedown.prevent @click="openPanel('image')"><ImagePlus :size="17" :stroke-width="2.2" /></button>
        <button type="button" class="toolbar-source" title="编辑 Markdown 源码" aria-label="Markdown 源码" :aria-pressed="sourceMode" :disabled="!editor" @click="toggleSource"><FileCode :size="17" :stroke-width="2.2" /><span>源码</span></button>
      </div>
      <textarea v-if="sourceMode" id="description-source" ref="source" v-model="model" class="markdown-source" maxlength="10000" rows="9" spellcheck="false"></textarea>
      <EditorContent v-show="!sourceMode" :editor="editor" />
    </div>
    <div v-if="panel === 'link'" id="markdown-link-panel" ref="panelElement" class="editor-insert-panel" :style="panelStyle">
      <strong>{{ editingLink ? '编辑链接' : '插入链接' }}</strong>
      <wa-input label="显示文字" :value.prop="label" placeholder="例如：资料来源" @input="label = $event.target.value"></wa-input>
      <wa-input label="HTTPS 链接" :value.prop="url" type="url" placeholder="https://example.org/source" @input="url = $event.target.value"></wa-input>
      <p role="status">{{ message }}</p>
      <div class="editor-insert-actions">
        <wa-button v-if="editingLink" appearance="outlined" size="s" type="button" @click="removeLink">移除链接</wa-button>
        <wa-button appearance="outlined" size="s" type="button" @click="closePanel">取消</wa-button>
        <wa-button appearance="filled" variant="brand" size="s" type="button" @click="insertLink">{{ editingLink ? '保存链接' : '插入链接' }}</wa-button>
      </div>
    </div>
    <div v-if="panel === 'image'" id="markdown-image-panel" ref="panelElement" class="editor-insert-panel" :style="panelStyle">
      <strong>插入正文图片</strong>
      <wa-input label="图片说明" :value.prop="label" placeholder="例如：毒鹅膏的菌盖" @input="label = $event.target.value"></wa-input>
      <wa-input label="图片外链（HTTPS）" :value.prop="url" type="url" placeholder="https://example.org/photo.jpg" @input="url = $event.target.value"></wa-input>
      <wa-input label="图片作者及授权" :value.prop="credit" placeholder="例如：张三，CC BY 4.0" @input="credit = $event.target.value"></wa-input>
      <p role="status">{{ message }}</p>
      <div class="editor-insert-actions"><wa-button appearance="outlined" size="s" type="button" @click="closePanel">取消</wa-button><wa-button appearance="filled" variant="brand" size="s" type="button" @click="insertImage">插入图片</wa-button></div>
    </div>
  </div>
</template>
