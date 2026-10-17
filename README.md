# Biotapedia 图鉴前端

这是一个 Vue 3 + Vite 多页面前端，部署到 GitHub Pages。页面本身不包含分类或物种数据；每次浏览时，它从同一 GitHub 组织的 `biopedia-data` Pages 项目请求 `roots.json`、`children/<id>/<page>.json` 和 `taxa/<id>.md`。

## 本地预览

两个仓库都位于同一个父目录下时，在本目录运行：

```sh
npm ci
npm run dev
```

打开 Vite 输出的本地地址浏览图鉴，或访问其 `contribute.html` 投稿。开发服务器会从相邻的 `biota-data/docs/` 读取数据。运行 `npm run build` 会生成 `dist/`；部署在 GitHub Pages 时，页面请求相邻的 `biopedia-data/`。不要直接以 `file://` 打开，否则浏览器无法正常 `fetch` 数据。

## 发布

把此仓库推送到 `biotapedia/biopedia-web`。在 **Settings → Pages → Build and deployment** 中把来源设为 **GitHub Actions**；`main` 分支上的工作流会执行 `npm ci`、构建并发布 `dist/`。数据仓库设置见其 README。两个默认 Pages 项目会位于 `https://biotapedia.github.io/biopedia-web/` 和 `https://biotapedia.github.io/biopedia-data/`。

前端使用 Vue 单文件组件管理目录、分页、投稿表单和 Markdown 编辑器的状态，并从 npm 构建 [Web Awesome](https://webawesome.com/docs) 的卡片、按钮及表单组件。`src/CatalogApp.vue` 与 `src/ContributionApp.vue` 分别负责两个页面；`src/MarkdownEditor.vue` 是投稿编辑器；`catalog-api.js` 共用数据请求；`taxonomy.js` 保存分类级别规则。`theme.css` 和 `contribute.css` 分别管理全站与投稿页样式。

新增或编辑图鉴数据时，这个仓库无需重新发布。若使用自定义域名或不同仓库名，调整 `catalog-api.js` 中的 `dataBase` 和 `src/ContributionApp.vue` 中的投稿仓库地址规则。

## 投稿

独立投稿页会在本地生成可供审核的 Issue 草稿。它支持直接访问，也支持从分类详情进入时通过 `?parent=<分类编号>` 预选上级分类。数据站点的 `config.json` 指向 `https://github.com/biotapedia/biopedia-data`。长草稿会提示用户复制后粘贴，以避免 GitHub 的网址长度限制。

投稿表单可从任意页面逐级选择已有分类，并补充最多 8 个缺失的中间层级。新建的上级分类与目标条目会被编码进同一份 Issue，数据仓库在一个 Pull Request 中生成所有条目及索引。

“介绍与特征”支持常用 Markdown 格式：标题、加粗、斜体、列表、引用、代码、HTTPS 链接和正文图片。编辑器提供格式按钮和预览；“插入图片”会收集 HTTPS 图片地址、替代文字及作者授权说明，再自动写入 Markdown。封面图片仍由独立的图片外链字段设置。正文图片由 `markdown.js` 安全渲染，不执行原始 HTML，也不加载非 HTTPS 图片。
