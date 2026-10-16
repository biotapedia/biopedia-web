# BIOTA 图鉴前端

这是一个没有构建步骤的 GitHub Pages 前端。页面本身不包含分类或物种数据；每次浏览时，它从同一 GitHub 账号的 `biota-data` Pages 项目请求 `roots.json`、`children/<id>/<page>.json` 和 `taxa/<id>.md`。

## 本地预览

两个仓库都位于同一个父目录下时，从父目录运行：

```sh
python3 -m http.server 8765
```

打开 `http://localhost:8765/biota-web/`。本地页面会请求 `../biota-data/docs/`；部署在 GitHub Pages 时，它会请求 `../biota-data/`。不要直接以 `file://` 打开，否则浏览器无法正常 `fetch` 数据。

## 发布

把此仓库推送到与数据仓库相同的 GitHub 账号，仓库名保持 `biota-web`。在 **Settings → Pages** 中选择 **Deploy from a branch → main → /(root)**。数据仓库设置见其 README。两个默认 Pages 项目会位于 `https://<owner>.github.io/biota-web/` 和 `https://<owner>.github.io/biota-data/`。

前端只使用浏览器原生 HTML、CSS 和 JavaScript，不需要 `npm install` 或构建。新增或编辑图鉴数据时，这个仓库无需重新发布。若使用自定义域名或不同仓库名，调整 `app.js` 中的 `dataBase` 和投稿仓库地址规则。

## 投稿

页面表单会在本地生成可供审核的 Issue 草稿。如果页面运行在默认的 `*.github.io` 域名上，会自动推断数据仓库为 `https://github.com/<owner>/biota-data`。长草稿会提示用户复制后粘贴，以避免 GitHub 的网址长度限制。本地预览没有 GitHub 远端，表单只生成草稿。
