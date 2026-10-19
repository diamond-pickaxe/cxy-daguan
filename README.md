# 宇的数学大观离线版

一个在自己电脑上运行的考研数学学习工具。提供 **数学一、数学二、数学三** 三个入口，题库与学习记录由自己管理。

> 公开发行包只包含 **6 道自编演示题**，不包含参考网站的完整题库、解析或图片，也不包含个人学习记录。请导入你自有或获授权的内容。

## 开始使用

**Windows 10/11 64 位：下载 [最新便携版](https://github.com/geRosina/cxy-mathos/releases/latest)，解压整个 ZIP，双击「宇的数学大观离线版.exe」。无需安装 Node.js、npm 或其他开发工具，也无需管理员权限。**

程序自动打开浏览器，选择数学一、二、三即可学习。首次打开也不需要联网。保留启动小窗口；点击「退出程序」或关闭小窗口，即会等待本地写入完成并停止服务。浏览器页面可以单独关闭，之后点击「打开学习页面」继续。

请解压到可写的普通文件夹，例如 `D:\学习\宇的数学大观`，不要只从 ZIP 内打开 EXE，也不要单独移动 EXE。`runtime/`、`public/`、`data/` 等文件夹需一起保留。升级时先导出备份，新版解压到新文件夹后再导入，避免覆盖旧数据。

服务只监听本机 127.0.0.1，便携版自动选择空闲端口，不会与已运行的旧版本冲突。同一文件夹重复打开 EXE 会唤起已运行的程序。

**源码运行或其他系统：**自行安装 [Node.js](https://nodejs.org/) **22 或更高版本**，进入项目目录运行 `node server.mjs`，打开 [http://127.0.0.1:4180](http://127.0.0.1:4180)。零外部 npm 依赖，无需运行 npm install。

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

Windows 打包使用系统自带 PowerShell 与 .NET Framework C# 编译器。打包时从 Node.js 官网下载固定版本运行时，核验 `tools/runtime-lock.json` 中的 SHA-256 后只包含 `node.exe` 与完整许可证；使用者首次运行时不会下载任何内容。

产物位于 `release/`，同时生成 SHA-256 校验值。打包会实际运行 EXE，验证在 PATH 中没有 Node.js 时仍可打开题库与记录接口并正常退出。CI 在 Windows 与 Linux 运行自动测试；推送 `v*` 标签可生成 GitHub Release。

## 原站与原作者

- **原站：[大观园](https://cxyonly.fans/)**
- **原作者：潇澄宇**
- 数学学习区：[https://cxyonly.fans/math](https://cxyonly.fans/math)

本项目参考原站排布与交互，独立适配本地存储和离线运行。EXE、页面标签与侧栏使用原站自带图标，图标来源和文件校验值见 [launcher/icon-source.json](launcher/icon-source.json)。此离线适配项目为非官方版本。

代码和自编演示题采用 [MIT](LICENSE)。原站名称、图标及第三方组件的权利归各自权利人，不属于本项目 MIT 授权范围。公式引擎、字体及附带 Node.js 运行时详见 [第三方说明](THIRD_PARTY_NOTICES.md)。
