# 部署到 GitHub Pages（固定域名 · 完全免费）

`docs/` 目录是纯静态站点，可直接部署到 GitHub Pages，获得**固定域名**，手机浏览器直接访问、永不变、不受沙盒回收影响。

- 用户端：`https://<你的GitHub用户名>.github.io/ielts-vocab/`
- 管理端：`https://<你的GitHub用户名>.github.io/ielts-vocab/admin.html`

## 文件说明（docs/）
- `index.html` —— 答题页（688 词词库内嵌，答题记录存浏览器 localStorage）
- `admin.html` —— 错误率统计（从本机 localStorage 计算，含三级排序/筛选/SVG 图表）
- `words.js` —— 词库（由 `export_words.js` 从 `ielts.db` 导出，已生成）

## 部署步骤（一次性）
1. 在 GitHub 网页新建公开仓库，名称建议 `ielts-vocab`。
2. 在项目目录 `ielts-vocab` 执行：
   ```bash
   git init
   git add docs
   git commit -m "ielts vocab static site"
   git branch -M main
   git remote add origin https://github.com/<用户名>/ielts-vocab.git
   git push -u origin main
   ```
3. 仓库 **Settings → Pages → Source** 选 `Deploy from a branch` → Branch: `main`，目录: `/docs` → Save。
4. 约 1–2 分钟后访问上面的固定域名即可。

## 重要说明
- 纯静态、无后端、无数据库；答题统计仅存于**答题者本机浏览器**（localStorage）。换设备 / 清缓存会清空记录。
- 若需多设备同步统计，后续可接入 Supabase 等后端（详见根目录 README）。
- 词库更新：修改 `ielts.db` 后重跑 `node export_words.js` 重新生成 `docs/words.js` 并重新 push。
