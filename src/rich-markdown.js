import { Extension, markInputRule, textblockTypeInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Blockquote from '@tiptap/extension-blockquote';
import Heading from '@tiptap/extension-heading';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { ListItem } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import { safeHttps } from '../taxonomy.js';

// The editor only offers what ../markdown.js can render: no nested lists,
// single-paragraph quotes, no line breaks, strike-through or underline.
export const cleanLabel = text => text.replace(/[\[\]\r\n]/g, '').trim();
export const markdownUrl = url => url.replaceAll('(', '%28').replaceAll(')', '%29').replaceAll(' ', '%20');

// Tiptap only formats **bold** / *italic* after a space; Chinese text rarely has one.
const CjkMarkInputRules = Extension.create({
  name: 'cjkMarkInputRules',
  addInputRules() {
    const { bold, italic } = this.editor.schema.marks;
    return [
      markInputRule({ find: /(?<![\w*])(\*\*(?!\s+\*\*)([^*]+)\*\*(?!\s+\*\*))$/, type: bold }),
      markInputRule({ find: /(?<![\w*])(\*(?!\s+\*)([^*]+)\*(?!\s+\*))$/, type: italic })
    ];
  }
});

export function richMarkdownExtensions(placeholder = '') {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      listItem: false,
      link: false,
      hardBreak: false,
      strike: false,
      underline: false
    }),
    // Entries only use 标题 (h2) and 小标题 (h3); `# ` and deeper levels fold into them.
    Heading.extend({
      parseMarkdown: (token, helpers) => helpers.createNode('heading', { level: Math.min(Math.max(token.depth || 2, 2), 3) }, helpers.parseInline(token.tokens || [])),
      addInputRules() {
        return [
          textblockTypeInputRule({ find: /^#{1,2}\s$/, type: this.type, getAttributes: { level: 2 } }),
          textblockTypeInputRule({ find: /^#{3,6}\s$/, type: this.type, getAttributes: { level: 3 } })
        ];
      }
    }).configure({ levels: [2, 3] }),
    Blockquote.extend({ content: 'paragraph' }),
    ListItem.extend({ content: 'paragraph' }),
    Link.extend({
      renderMarkdown: (node, h) => `[${h.renderChildren(node)}](${markdownUrl(node.attrs?.href ?? '')})`
    }).configure({
      openOnClick: false,
      defaultProtocol: 'https',
      isAllowedUri: url => Boolean(safeHttps(url)),
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }
    }),
    Image.extend({
      renderMarkdown: node => `![${cleanLabel(node.attrs?.alt ?? '')}](${markdownUrl(node.attrs?.src ?? '')})`
    }).configure({ inline: true, HTMLAttributes: { referrerpolicy: 'no-referrer' } }),
    CjkMarkInputRules,
    Markdown,
    Placeholder.configure({ placeholder })
  ];
}

export function looksLikeMarkdown(text) {
  return /^(?:#{1,3}\s|[-*+]\s|\d+[.)]\s|>\s?|```)|\*\*[^*\n]+\*\*|!?\[[^\]\n]+\]\([^)\s]+\)/m.test(text);
}
