# 宇的数学大观离线版

一个在自己电脑上运行的考研数学学习工具。提供 **数学一、数学二、数学三** 三个入口，题库与学习记录由自己管理。

> 公开发行包只包含 **6 道自编演示题**，不包含参考网站的完整题库、解析或图片，也不包含个人学习记录。请导入你自有或获授权的内容。

## 开始使用

需要 [Node.js](https://nodejs.org/) **22 或更高版本**。零外部 npm 依赖，无需运行 npm install。

- Windows：下载 Release ZIP 并解压，双击 **启动考研数学.cmd**。
- 其他系统：进入项目目录后运行 `node server.mjs`。
- 打开 [http://127.0.0.1:4180](http://127.0.0.1:4180)，选择学习入口。

本地服务仅监听 127.0.0.1。关闭启动窗口即可停止服务。ZIP 不内置 Node.js 运行时。

## 功能

- 三个科目入口，目录、练习、收藏、错题、笔记、掌握地图和统计随入口筛选。
- 连续题目卡片、可调整宽度的章节目录、答案与解析展开。
- 选择题核对与主观题自评；收藏、笔记和标签。
- 错题复测、年度热力图、目标日期和继续练习。
- 记录自动写入本机文件，保留每日备份和上一次存档。
- 多窗口写入冲突保护；JSON 题库导入、编辑、导出与记录恢复。
- 公式引擎与字体均在本地，不加载 CDN 或上传学习记录。

同一道共用题的收藏、笔记和掌握程度在三个入口共享；每个入口分别记住上次练习位置。

## 导入题库

打开右上角头像 → **数据管理与备份** → **导入题库**。JSON 格式参考 [examples/demo-library.json](examples/demo-library.json)。

每道题使用唯一整数 `id`，以 `exam_subjects` 标记适用科目，例如：

```json
{
  "id": 1001,
  "category_id": 101,
  "category_ids": [101],
  "exam_subjects": ["math_1", "math_2", "math_3"],
  "stem": "这里填写题干，数学公式使用 LaTeX。",
  "correct_answer": "这里填写答案。",
  "answer_explanation": "这里填写解析。",
  "question_type": "subjective",
  "source": "自编练习",
  "options": []
}
```

JSON 顶层包含 `questions`、`categories`，可附带 `manifest` 与 `subjectMembership`。

- `math_1` = 数学一，`math_2` = 数学二，`math_3` = 数学三。
- 题目可属于多个科目。没有科目标记的新增题目不会被擅自归入任一入口。
- 自定义 `exam_subjects` 优先于导入的科目 ID 快照。
- 题干、答案、解析支持 `$...$` 与 `$$...$$` 公式。
- 图片需另存为本地文件并随项目迁移；JSON 导出不内嵌图片。
- 导入替换前会备份旧题库。保留题目 ID 可继承对应学习记录。

## 数据与备份

| 文件 | 用途 |
| --- | --- |
| `data/questions.json` | 当前题库 |
| `data/categories.json` | 章节目录 |
| `data/progress.json` | 个人学习记录，首次保存时生成 |
| `data/backups/` | 自动备份，运行时生成 |
| `public/assets/subject-membership.json` | 科目适用 ID 快照 |

可以在页面导出 JSON，或关闭服务后复制整个文件夹。数据是本机普通文件，并非加密存储。

**请勿把你导入的私有题库、个人笔记或自动备份提交到公开仓库。** 发布脚本采用文件白名单，排除进度、备份、原始采集、图片附件和本机配置。修改的题库文件也需要在分享前自行检查。

## 开发与打包

```sh
node --version
npm test
npm start
npm run release
```

Windows 打包使用系统自带 PowerShell 压缩工具。产物位于 `release/`，同时生成 SHA-256 校验值。CI 运行自动测试；推送 `v*` 标签可生成 GitHub Release。

## 许可与致谢

代码和自编演示题采用 [MIT](LICENSE)。第三方公式引擎与字体详见 [第三方说明](THIRD_PARTY_NOTICES.md)。界面交互参考 [大观园数学学习区](https://cxyonly.fans/math)，本项目独立实现。
