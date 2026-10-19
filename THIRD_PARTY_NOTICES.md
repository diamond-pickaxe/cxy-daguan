# 第三方说明

- 数学公式显示使用 KaTeX 0.16.22（MIT）。完整许可证位于 `public/vendor/KATEX-LICENSE.txt`，字体随 KaTeX 发行包提供。
- 原站：[大观园](https://cxyonly.fans/)，原作者：**潇澄宇**。数学学习区：[https://cxyonly.fans/math](https://cxyonly.fans/math)。此项目是独立实现的非官方离线适配。
- EXE 与网页使用原站自带的 64 / 192 像素 PNG 图标。ICO 仅封装原图，未重新绘制。来源与 SHA-256 见 `launcher/icon-source.json`。图标及原站品牌归原权利人，不适用本项目 MIT 许可。
- Windows 便携包附带 Node.js 22.23.3（win-x64）。来源 `https://nodejs.org/dist/v22.23.3/`，固定下载地址与校验值见 `tools/runtime-lock.json`；完整 Node.js 及依赖许可证随便携包保留在 `runtime/LICENSE`。
- v1.2.0 起公开版本包含 2026-10-19 迁移的完整公开题库快照：7,083 道题、答案、文字解析与 1,639 张配图。题目原有来源信息保留；这些资料的权利归原权利人，不适用本项目 MIT 许可。快照已移除用户收藏、掌握状态与目录完成统计，不含个人学习记录、笔记或备份。`examples/demo-library.json` 的六道示例题由本项目自编。
- MIT 许可适用于本项目代码和自编示例，不改变用户自行导入资料的权利归属。

## 408 真题与页面样式

408 题库来自 https://www.408os.cn/ ，本地整合基于同项目的 408 离线版。CSS 与 408 标识从原站实际加载的资源导出，来源和校验值见 library/cs408-styles.json；样式仅移除 Vue 的 data-v 作用域以适配独立 DOM。这些题目、图片、标识与 CSS 的权利归原权利人，不适用本项目 MIT 许可。408 自带公式引擎与字体许可证完整保留在 public/408/THIRD_PARTY_NOTICES.md。
