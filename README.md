# Understanding NMR Spectroscopy — Markdown 版

James Keeler, *Second Edition*, Wiley 2010（原 PDF 527 页）

本目录由 `Understanding NMR Spectroscopy James Keeler ... .pdf` 自动转换而成。

## 说明

- **正文**：从 PDF 文本层抽取，段落与标题按原书结构还原。
- **插图 / 公式 / 表格**：因原书公式为 LaTeX 多行排版（含 bra-ket、下标注解），纯文本无法忠实还原，故按原版式以 170–260 dpi 裁切为 PNG，统一放在 `images/`（`fig-` 插图 / `eq-` 公式 / `tbl-` 表格，文件名含原页码）。
- **内联公式**：保留 Unicode 形式，上标下标用 `<sup>`/`<sub>` 标记（Obsidian 可直接渲染）。
- 行内公式中的 `⋆` 为原排版符号，代表乘号 `*`。

## 文件

- `chapters/` — 按章拆分，便于分章阅读与导入笔记软件
- `Understanding-NMR-Spectroscopy.md` — 全书合并版
- `images/` — 全部插图与公式图片
- `reader/index.html` — 本地网页阅读版（**双击打开**即用；落库见下）
- `reader/app.css`、`reader/app.js`、`reader/data.js`、`reader/book.pdf`
- `server.py` — 标准库写的本地服务（SQLite 落库用）
- `start-reader.bat` — 启动服务并打开浏览器

## 本地精读阅读器（reader/）

### 启动方式

两种模式等价使用同一份数据，按需求选：

| 模式 | 启动 | 学习数据写到 |
| --- | --- | --- |
| **直接打开** | 双击 `reader/index.html`（或拖进浏览器） | 浏览器 `localStorage` |
| **落库模式** | 双击 `start-reader.bat`（自动启动 `server.py` 并打开浏览器） | SQLite 数据库 `nmr-reader.db` |

- 落库模式下，关闭浏览器或换电脑也不丢；导出的 Markdown / JSON 备份可随时回灌。
- 落库模式需要本机装有 Python 3.x（`py -3` 或 `python`）。
- 自定义端口：`NMR_PORT=9000`，自定义数据库：`NMR_DB=.../other.db`。

### 功能

- **三栏精读布局**：目录 / 正文 / 进度+书签+笔记侧板；浅色 / 深色双主题（顶栏右下角切换或按 `T`）。
- **学习进度**：按各章篇幅加权计算总进度，自动记录每章「最远滚动位置」+「当前块」，下次打开自动定位到上次阅读位置。
- **书签**：顶栏点书签按钮（或 `B`）在当前位置加书签，自动以「最近小节标题」命名，可在右栏书签面板里重命名、定位、删除。
- **划词笔记 / 高亮**：在正文选中文字会浮出工具条，可选 4 种颜色直接高亮，或打开笔记对话框写下批注；点击文中的高亮再编辑。
- **索引**（左栏「索引」标签）：
  - **书后索引**：解析原书 Index 章，按术语首字母 A–Z 分组（已纠正抽取顺序错误）；原书页码可一键跳到正文定位；缺失页码的术语自动用倒排索引补「正文出现页」；交叉引用 (`see X`) 显示为跳转入口。
  - **标题索引**：全书的 h2/h3 标题一览，可筛选、可点击跳转。
- **全文检索**：顶栏 `/` 聚焦，倒排索引 + 加权排序 + 中文/英文混合分词；↑↓ 选，Enter 跳；当前页/章高亮。
- **正文页码链接**：文中 `page 109`、`p. 234` 等自动变成可点击的原书页码跳转。
- **原页对照**：顶栏底「原书 p.N · 原页对照」跟随当前阅读位置（基于数据 `page` 字段 + 15 = 原书印刷页码，已用 76 条索引条目抽验：72 命中）。
- **导出 / 导入 / 重置**：进度面板底部 `导出 MD` / `Anki` / `备份` / `导入`；`重置进度`（进度清零、回到第一章，**书签与笔记保留**，用于重读一遍）；`清空全部`（连书签笔记一起删，慎用）。导出 Markdown 可直接贴进 Obsidian、Notion；JSON 备份便于换设备恢复。

### 网页特有功能（PDF 阅读器做不到的）

- **原书对照分屏**（`C` 或章节工具条 ⊞）：左侧继续读重排正文，右侧同步显示原书对应页，随滚动自动跟随（可取消"跟随"自己翻）；窄屏变全屏浮层。
- **图表内链**：正文里的 `Fig. 5.8`、`Table 2.1` 全部可点击，直达对应图表并高亮（公式编号印在图片内部、数据里拿不到，故未做公式内链）。
- **图集**：侧栏「图集」以缩略图墙浏览全书插图，可按图注/编号筛选，点击直达原文。
- **术语悬浮卡**：内置 93 条 NMR 中英术语表（`reader/glossary.js`）；正文术语自动带虚线下划线，悬停弹出中文释义卡，卡内可一键全文检索；侧栏「术语」可浏览/检索全部术语。
- **命令面板**：`Ctrl+K`（或 `P`）全局跳转——章节 / 小节 / 书后索引 / 术语 / 插图 / 书签 / 笔记 / 常用指令，模糊匹配、↑↓ 选择。
- **返回上次位置**：任何跳转都入栈，`Backspace` 或章节工具条 ↩ 回到刚才的位置，可连按。
- **排版设置**：章节工具条 `Aa` 调字号 / 行距 / 版心，实时生效并记忆。
- **专注模式**：`F` 隐藏两侧栏与页码浮标，`Esc` 退出。
- **阅读打卡**：自动记录每日阅读时长（页面打开且未切走即计时），进度面板显示今日 / 连续 / 累计 + 最近 11 周热力图。
- **Anki 导出**：带正文的笔记一键导出为 TSV 卡片（正面 = 原文摘录，背面 = 批注，标签含章节与页码）。
- **引用复制**：划词工具条「引用」把选中文字连同出处复制成 Markdown 引用块。

### 快捷键

- `Ctrl+K` / `P` 命令面板；`/` 聚焦全文检索；`Esc` 关闭弹窗
- `B` 加书签；`N` 笔记面板；`C` 对照分屏；`T` 主题；`I` 索引；`F` 专注模式
- `Backspace` 返回上次位置；`←` / `→` 切章；`g` / `G` 章首 / 章尾

### 自检

`reader/_test.html` 是无头浏览器回归测试，启动服务后用 Chrome headless 跑 `http://127.0.0.1:PORT/reader/_test.html` 即可（详见文件中注释）。

## 目录

- [Preface](chapters/00-Preface.md)
- [Preface to the first edition](chapters/01-Preface-to-the-first-edition.md)
- [1 What this book is about and who should read it](chapters/02-What-this-book-is-about-and-who-should-read-it.md)
- [2 Setting the scene](chapters/03-Setting-the-scene.md)
- [3 Energy levels and NMR spectra](chapters/04-Energy-levels-and-NMR-spectra.md)
- [4 The vector model](chapters/05-The-vector-model.md)
- [5 Fourier transformation and data processing](chapters/06-Fourier-transformation-and-data-processing.md)
- [6 The quantum mechanics of one spin](chapters/07-The-quantum-mechanics-of-one-spin.md)
- [7 Product operators](chapters/08-Product-operators.md)
- [8 Two-dimensional NMR](chapters/09-Two-dimensional-NMR.md)
- [9 Relaxation and the NOE](chapters/10-Relaxation-and-the-NOE.md)
- [10 Advanced topics in two-dimensional NMR](chapters/11-Advanced-topics-in-two-dimensional-NMR.md)
- [11 Coherence selection: phase cycling and field gradient pulses](chapters/12-Coherence-selection-phase-cycling-and-field-gradient.md)
- [12 Equivalent spins and spin system analysis](chapters/13-Equivalent-spins-and-spin-system-analysis.md)
- [13 How the spectrometer works](chapters/14-How-the-spectrometer-works.md)
- [A Some mathematical topics](chapters/15-A-Some-mathematical-topics.md)
- [Index](chapters/16-Index.md)

## 统计

- 插图 454 张 / 公式 1522 个 / 表格 11 个
- 章节文件 17 个
