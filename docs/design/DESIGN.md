---
version: 1.3.0
name: Semanote-Apple-design-system
description: A photography-first interface that turns marketing into a museum gallery. Edge-to-edge product tiles alternate light and dark canvases, framed by SF Pro Display headlines with negative letter-spacing and a single Action Blue (#0066cc) interactive color. UI chrome recedes so the product can speak — no decorative gradients, no shadows on chrome, only the one signature drop-shadow under product imagery resting on a surface.

colors:
  annotation-person: "#216e4e"
  annotation-location: "#265aa5"
  annotation-organization: "#725199"
  annotation-time: "#92621d"
  annotation-money: "#9a4f38"
  primary: "#0066cc"
  primary-focus: "#0071e3"
  primary-on-dark: "#2997ff"
  ink: "#1d1d1f"
  body: "#1d1d1f"
  body-on-dark: "#ffffff"
  body-muted: "#cccccc"
  ink-muted-80: "#333333"
  ink-muted-48: "#7a7a7a"
  divider-soft: "#f0f0f0"
  hairline: "#e0e0e0"
  canvas: "#ffffff"
  canvas-parchment: "#f5f5f7"
  surface-pearl: "#fafafc"
  surface-tile-1: "#272729"
  surface-tile-2: "#2a2a2c"
  surface-tile-3: "#252527"
  surface-black: "#000000"
  surface-chip-translucent: "#d2d2d7"
  on-primary: "#ffffff"
  on-dark: "#ffffff"

typography:
  hero-display:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: -0.28px
  display-lg:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0
  display-md:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.47
    letterSpacing: -0.374px
  lead:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.14
    letterSpacing: 0.196px
  lead-airy:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 24px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  tagline:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1.19
    letterSpacing: 0.231px
  body-strong:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.24
    letterSpacing: -0.374px
  body:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: -0.374px
  dense-link:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 2.41
    letterSpacing: 0
  caption:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: -0.224px
  caption-strong:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: -0.224px
  button-large:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 300
    lineHeight: 1.0
    letterSpacing: 0
  button-utility:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: -0.224px
  fine-print:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.12px
  micro-legal:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: -0.08px
  nav-link:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.12px

rounded:
  none: 0px
  xs: 5px
  sm: 8px
  md: 11px
  lg: 18px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 17px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

annotation:
  person: "{colors.annotation-person}"
  location: "{colors.annotation-location}"
  organization: "{colors.annotation-organization}"
  time: "{colors.annotation-time}"
  money: "{colors.annotation-money}"
  segmentation: source-token-boundary
  keywords: wavy-underline
  pos: text-color
  ner: background-highlight

components:
  annotation-editor:
    backgroundColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  annotation-inspector:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  tooltip:
    backgroundColor: "{colors.surface-tile-1}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.sm}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: 11px 22px
  button-primary-focus:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  button-primary-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  button-secondary-pill:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: 11px 22px
  button-dark-utility:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button-utility}"
    rounded: "{rounded.sm}"
    padding: 8px 15px
  button-pearl-capsule:
    backgroundColor: "{colors.surface-pearl}"
    textColor: "{colors.ink-muted-80}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  button-store-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-large}"
    rounded: "{rounded.pill}"
    padding: 14px 28px
  button-icon-circular:
    backgroundColor: "{colors.surface-chip-translucent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: 44px
  text-link:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  text-link-on-dark:
    backgroundColor: transparent
    textColor: "{colors.primary-on-dark}"
    typography: "{typography.body}"
  global-nav:
    backgroundColor: "{colors.surface-black}"
    textColor: "{colors.on-dark}"
    typography: "{typography.nav-link}"
    height: 44px
  sub-nav-frosted:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.tagline}"
    height: 52px
  product-tile-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  product-tile-parchment:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  product-tile-dark:
    backgroundColor: "{colors.surface-tile-1}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  product-tile-dark-2:
    backgroundColor: "{colors.surface-tile-2}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.none}"
  product-tile-dark-3:
    backgroundColor: "{colors.surface-tile-3}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.none}"
  store-utility-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.lg}"
    padding: 24px
  configurator-option-chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 12px 16px
  configurator-option-chip-selected:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  search-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: 12px 20px
    height: 44px
  floating-sticky-bar:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: 64px
    padding: 12px 32px
  environment-quote-card:
    backgroundColor: "{colors.surface-tile-1}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  footer:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink-muted-80}"
    typography: "{typography.fine-print}"
    padding: 64px
---

## Overview

Semanote 把正文作为视觉中心，界面退到内容之后。Apple 的单蓝强调、系统字体、明暗表面、轻边界、胶囊动作和无卡片阴影构成共同语言。preview 严格沿用来源的展示顺序；业务工作台将展示中的产品主角替换为真实文本编辑器。

## Colors

### Brand & Accent

仅 `{colors.primary}` 用于操作、链接、选择和焦点；深色表面使用 `{colors.primary-on-dark}`。基础色值保持 Apple 原值，见 YAML 和 tokens.css。

### Surface

白色正文纸面，Parchment 工作台背景，Near-Black 推理面板，纯黑全局导航。通过表面变化建立层次，不用装饰渐变或卡片阴影。

### Text

正文 Ink；次级说明使用 muted。标注数据的类别颜色与交互强调分别命名，不能以数据颜色冒充按钮动作。

### Hairlines & Borders

表面边界 1px hairline；列表行用 divider-soft。边框服务于分组，不给每段文字增加框。

### Brand Gradient

无装饰渐变。环形图的扇区只表示真实类别数据，不承担装饰背景。

## Typography

### Font Family

沿用 SF Pro / system-ui / Microsoft YaHei 回退，不下载 Apple 专有字体。编辑器可选择系统字体、宋体、楷体、等宽字体。

### Hierarchy

| Role | Size / Weight | Use |
|---|---|---|
| hero-display | 56px / 600 | preview 的开场 |
| display-lg | 40px / 600 | 文本库与统计页标题 |
| display-md | 34px / 600 | 窄屏标题 |
| lead | 28px / 400 | 展示页引导 |
| tagline | 21px / 600 | 面板标题 |
| body | 17px / 400 / 1.47 | 正文与说明 |
| caption | 14px / 400 | 工具、表单与列表摘要 |
| fine-print | 12px / 400 | 次级元数据 |

### Principles

字重使用 300/400/600/700；不用 500。负字距仅用于标题。正文不因单屏需求缩小；阅读器默认 19px/2.1，移动端默认 17px/2，用户可调。

### Note on Font Substitutes

优先操作系统字体；不同平台字形略有差异，布局依内容伸缩，不依赖固定字宽。

## Layout

### Spacing System

4/8/12/17/24/32/48/80px，与 YAML 键保持一致。preview 区块垂直 80px，业务面板 17–24px。

### Grid & Container

1440px 内容上限；工作台为导航＋主内容，正文宽于详情栏。1068px 以下详情移至正文后；833px 以下导航变为底栏。开发者中心独立 URL `/developer`，不嵌在业务布局中。

### Whitespace Philosophy

展示页留白托起标题与样例，工作台留白托起正文。删掉重复解释和无用注释，保留错误恢复、授权与版本信息。

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | 无阴影 | 页面、正文、列表 |
| Soft hairline | 1px 边界 | 工具卡片和分组 |
| Backdrop blur | 小面积半透明 | 导航和模态遮罩 |
| Surface change | 白/灰/深色切换 | 阅读、检查与推理的层次 |

### Decorative Depth

没有产品摄影则不使用 product-shadow。工作台不通过浮夸阴影制造深度。

## Shapes

### Border Radius Scale

0 / 5 / 8 / 11 / 18 / 9999px。完整展示 tile 不圆角；工具 8px、紧凑面板 11px、卡片 18px、主动作和搜索胶囊。

### Photography Geometry

本产品以文本样例承担展示主角，不添加无关摄影或虚构截图。preview 的样例均为原创合成。

## Components

### Top Navigation

黑色 48px 全局栏＋浅色工具栏；开发者中心有自己的项目导航和完整资料视口。

### Buttons

Primary、focus、active、secondary-pill、dark-utility、pearl、icon-circle、text-link 分别展示。按钮按压 scale(.95)，点击目标至少 44px。

### Cards & Containers

preview 交替明暗 tile＋白色 utility grid。正文编辑器保持最大视觉权重；辅助检查面板可滚动，主操作稳定放在底部。

### Annotation Layers

分词使用词语边界/轻底线，关键词使用波浪线，词性使用文本颜色，实体使用类别底色；多层独立切换。相交区间切成共同片段，详情保留全部命中条目，不能只显示最高优先级一层。数据颜色来自本轮用户要求，界面操作仍只有 Action Blue。

### Inputs & Forms

显式标签、输入边界、失败保留输入。对话框为固定 Header/Body/Footer，只有 Body 滚动。

### Settings & Motion

设置使用原生 dialog 的三段结构，界面阅读偏好即时生效，模型设置显式保存。按压 160ms、显现 260–320ms，使用 cubic-bezier(.2,.7,.2,1)。逐词呈现有 1200ms 总延迟上限，扫描线只在真实运行期间存在。尊重系统 prefers-reduced-motion 与用户减少动效开关。暂停动画不能影响任务或保存结果。

### Footer

Parchment 资料页尾，展示来源、规范与返回入口，不堆放产品实现说明。

## Do's and Don'ts

### Do

- 使用 token 引用，沿用唯一交互蓝。
- 正文、结果、候选、草稿与历史具有可见身份。
- 真实推理状态与结果呈现动画分开。
- 保存后重新读取，并让统计与导出绑定同一快照。

### Don't

- 不用装饰渐变、卡片投影或第二品牌强调色。
- 不用无依据的进度百分比/置信度/准确率。
- 不因色彩丰富而让正文难以阅读；图层可单独关闭。
- 不让常驻技术说明挤占正文。

## Responsive Behavior

### Breakpoints

| Width | Behavior |
|---|---|
| ≤419px | 28/34px 展示标题；单列正文和工具换行 |
| ≤640px | 单列卡片；弹窗安全边距 12px；触控目标 ≥44px |
| ≤833px | 主导航固定底栏；资料导航横向切换 |
| ≤1068px | 标注详情移至正文后方 |
| ≥1441px | 内容上限 1440px，增加外围留白 |

### Touch Targets

触控动作至少 44×44px；移动端工具可换行，不靠页面横向滚动容纳。

### Collapsing Strategy

正文→选区操作→标注详情；不把次要侧栏排在正文前。模态操作不随 Body 滚出视口。

### Image Behavior

无外部图片依赖；SVG 图表与图标随容器缩放。

## Iteration Guide

逐轮只调整一个有依据的目标，记录来源、改动与实际检查；新规范纳入本文件及 preview，保持共享 token 和组件一致。迭代证据见 iterations.md。

## Known Gaps

上游没有提供业务表单、错误、文本标注语义色和任务进度；这些由本轮用户指令补充，不能假称 Apple 原规范。颜色不能替代标签；数据集没有人工金标准，结构正确不等于语义准确。


## 0.1.1 — Evidence, overlays and navigation

Pointer overlays use white canvas, existing ink, a hairline border and 11px radius; place 14px right and 18px below the pointer, then constrain the measured box to an 8px viewport inset. Keyboard focus anchors to the control. Scroll, resize and Escape dismiss the overlay. No chrome shadows are introduced.

Desktop navigation collapses to a compact rail. Narrow layouts retain labelled navigation. The annotation canvas uses an Action Blue arrow cursor while source inputs preserve normal editing. Paragraph/semantic breaks are presentation only; original character order and spacing stay unchanged.

Additive data marks: grammatical errors use a negative wavy underline; sentiment uses positive/negative neutral data encoding; relation/event cards use existing entity surfaces. Show labels with colors. Per-document charts identify their candidate/draft/snapshot source; radar axes encode counts, never accuracy. Contextual event roles each retain their own exact source spans.

Git history is horizontal, older left and newer right. Place the slider below the commit graph; its blue filled track represents the earlier portion. This progress encoding is the only data gradient here. Keep actual commits distinct from the GitFlow policy diagram.

---

## 15. Immersive Workspace & Navigation

### Layout

- Product and developer navigation stay at the top. Settings retain side navigation.
- Center the source editor between two evidence rails; place per-document charts immediately below the source. At ≤833px show source, charts, evidence cards, then editable detail.
- Supplier settings use a list/detail split. A configured-key indicator never implies connectivity, sync, or balance.

### Motion

- Extract returned content from the source-facing edge: 24px offset, 480ms, cubic-bezier(.16,1,.3,1.08), staggered by card. A small settling overshoot ends at the original geometry.
- Loading placeholders reflect actual unfinished tasks. Animation never invents completed words or inference progress. System and user reduced-motion preferences remove transforms and animation.

### Evidence Navigation

- Actual Git parent paths use labelled main/develop/release/feature colors. Commit cards retain matching accent borders; selected time clips completed paths and moves a visible cursor. Older is left; the range fills from the left.
- File changes have path filtering and addition/deletion totals. Code diffs have old/new line numbers, context and hunk boundaries; binary/omitted/truncated data is labelled.
- System architecture nodes link to the relevant framework with an accessible breadcrumb return and restrained zoom transition.

### Compatibility

Retain chapters 01–12 and the eleven annotation layers. Action Blue remains the interaction color; branch and annotation colors encode data only. Reuse tokens.css in the product, developer center and preview.
