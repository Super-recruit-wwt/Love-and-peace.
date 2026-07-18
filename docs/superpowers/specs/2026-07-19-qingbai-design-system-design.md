# 「青白 Qingbai」设计系统 — Love and Peace 网站视觉风格方案

> 融合来源：`网址风格设计/网页设计方案.md`（宋瓷美学）× `网址风格设计/cohere/DESIGN.md`（Cohere 设计系统分析）
> 融合策略：**宋瓷为魂，Cohere 为骨**
> 文档版本 v1.1 ｜ 2026-07-19 ｜ 状态：已实施（字体方案按实际落地更新）

---

## 1. 背景与决策记录

Love and Peace 是 AI 情感陪伴聊天平台（产品架构见 `2026-07-18-love-and-peace-design.md`）。现有前端使用四套通用配色主题（清新/温暖/暗色/绿意），视觉上缺乏品牌识别度。本方案将两份风格资料融合为一套统一的视觉系统。

经确认的关键决策：

| 决策点 | 结论 |
|---|---|
| 与现有主题系统的关系 | **全站唯一视觉标识**。删除四套通用主题，只保留本系统的亮色（纸）/暗色（砚）双模式 |
| 页面范围 | 现有 7 个应用页面 + **新增对外 Landing 页** |
| 字体加载 | **混合策略**：西文小体积 webfont + 中文标题子集化宋体 + 正文系统字体 |
| 融合策略 | **方案 A「宋瓷为魂，Cohere 为骨」**：宋瓷提供全部色彩与材质，Cohere 提供全部结构语法 |

## 2. 设计理念

**系统命名「青白 Qingbai」**——取自青白瓷，宋代最具代表性的瓷种，白釉中透出青色。「白」对应 Cohere 的编辑式白色画布，「青」既是宋瓷釉色、也暗合 Cohere 标志性的深绿。

**分工原则**：

- 所有「面」来自宋瓷：温暖、带灰度、有材质（宣纸、釉面、墨）。
- 所有「骨」来自 Cohere：留白即信任、细线代替边框、深色带做节奏、巨型标题克制使用。

**三条铁律**：全程无高饱和色；无渐变底色；无重阴影。

## 3. 色彩体系

### 3.1 亮色模式「纸」（默认）

| 角色 | 色值 | 命名 | 来源逻辑 |
|---|---|---|---|
| 页面画布 | `#F5F2EC` | 宣纸白 | 宋瓷原案，替代 Cohere 纯白画布 |
| 卡片表面 | `#FBF9F5` | 瓷面 | 比画布略亮，如釉面 |
| 主文字 / 主按钮底 | `#2B2B2B` | 玄墨 | 宋瓷原案，兼任 Cohere 近黑 CTA 职能 |
| 次级文字 | `#7A756B` | 古铜灰 | 宋瓷原案 |
| 弱文字 / 元数据 | `#A39C90` | 灰陶 | 对应 Cohere muted |
| 深色带 | `#182420` | 黛墨 | Cohere 深绿 `#003c33` 沉降至砚墨所得 |
| 链接 / 正向 | `#46685B` | 青瓷绿 | 承担 Cohere action-blue 职能 |
| 强调 / 悬停 | `#B8A89A` | 藕荷 | 宋瓷原案 |
| 分割细线 | `#D9D3C9` | 竹青灰 | 承担 Cohere hairline 职能 |
| 印章 / 警示 | `#A63A2B` | 印泥朱 | 承担 Cohere coral 职能（标签、暖点缀），兼作危险操作色 |
| 深色带上的文字 | `#E9E4DA` | 月白 | 黛墨带与玄墨 Footer 上的文字 |

### 3.2 暗色模式「砚」

| 角色 | 色值 | 说明 |
|---|---|---|
| 页面画布 | `#1D1C1A` | 暖调近黑，如砚台，不用冷黑 |
| 卡片表面 | `#282623` | 表面以 1px `rgba(255,255,255,0.06)` 细线代替阴影 |
| 主文字 | `#E9E4DA` | 月白 |
| 次级文字 | `#A29A8C` | — |
| 弱文字 | `#6E685E` | — |
| 强调 / 悬停 | `#C2B2A3` | 藕荷提亮 |
| 链接 / 正向 | `#7FA08F` | 青瓷绿提亮 |
| 印章 / 警示 | `#C05C4A` | 印泥朱提亮 |
| 分割细线 | `#3A3733` | — |
| 主按钮 | 底 `#E9E4DA`，字 `#1D1C1A` | 亮色反转，维持最高对比 |

暗色模式不是机械反色，而是「墨的世界」，整体依然温暖。

### 3.3 使用规则

- 黛墨深色带只出现在 Landing 功能展示区与 Footer；应用内部（聊天、设置等）不使用色带，保持宁静。
- 印泥朱是全站唯一的高注意力颜色，用量克制：印章、性格标签点缀、危险操作。不做大面积填充。
- 青瓷绿只用于文字链接、成功状态、聚焦环；不做按钮底色。
- 主按钮永远是玄墨（暗色模式为月白），紫色系不做按钮——Cohere 纪律。

## 4. 字体系统

### 4.1 角色分工

| 角色 | 字体 | 加载方式 |
|---|---|---|
| 中文展示标题 | 思源宋体 Light/Regular（Noto Serif SC） | npm `@fontsource/noto-serif-sc`：按 unicode-range 切片的 woff2，浏览器只下载标题实际用到的切片 |
| 西文展示 / 品牌字 | Space Grotesk | npm `@fontsource/space-grotesk` 拉丁子集 |
| 等宽标记 | IBM Plex Mono | npm `@fontsource/ibm-plex-mono` 拉丁子集；承担 CohereMono 职能：时间戳、状态标签、日期分隔 |
| 正文 / UI | 系统字体栈（PingFang SC / MiSans / HarmonyOS Sans / 微软雅黑） | 零加载 |

后备栈：中文标题回退 `"Source Han Serif SC", "Noto Serif SC", "Songti SC", serif`。

### 4.2 双语双字距规则

同一页面内刻意并置两种字距气质，是「魂与骨」的视觉宣言：

- 中文大标题：`letter-spacing: 0.04em`（汉字要呼吸，宋瓷规则）
- 西文大标题：`letter-spacing: -0.02em`（紧凑雕刻感，Cohere 规则）

### 4.3 字阶

| 层级 | 规格 | 用途 |
|---|---|---|
| hero-display | `clamp(48px, 8vw, 88px)` · 宋体 300 · 行高 1.15 | Landing 主标题，每页最多出现一次 |
| section-display | `clamp(40px, 5vw, 56px)` · 宋体 300 · 行高 1.2 | Landing 区块标题、Portal 问候语 |
| section-heading | 28px · 宋体 400 · 行高 1.3 | 页面标题 |
| card-heading | 20px · 宋体 400 · 行高 1.4 | 卡片标题、角色名 |
| body-large | 17px · 系统 sans 400 · 行高 1.8 | 导语、聊天气泡 |
| body | 15px · 系统 sans 400 · 行高 1.7 | 默认正文 |
| button | 14px · 系统 sans 500 | 按钮 |
| caption | 13px · 系统 sans 400 | 辅助说明 |
| mono-label | 12px · Plex Mono 400 · 大写 · 字距 0.08em | 系统标记 |

层级由尺寸、留白与表面对比完成，不依赖粗体堆叠——Cohere 纪律。

### 4.4 子集化工作流（实施更新）

实际实现采用 `@fontsource/noto-serif-sc`（300/400 两个字重），其自带 Google Fonts 切片：每个字重拆为一百余个小 woff2，`@font-face` 以 unicode-range 声明，浏览器仅下载页面标题实际覆盖的切片。因此无需手工维护字符清单，新增标题文案自动生效。正文永不使用 webfont。字体在 `client/src/main.jsx` 顶部以 CSS import 引入。

## 5. 材质与质感

- **宣纸噪点**：画布叠加 3% 透明度 SVG fractalNoise 噪点（宋瓷原案 CSS 方案，零网络请求）。深色带与暗色模式不加噪点。
- **釉面卡片（瓷面卡）**：瓷面色底 + 1px 白色内高光（`inset 0 0 0 1px rgba(255,255,255,0.6)`）+ 弥散阴影 `0 4px 24px rgba(43,43,43,0.06)`，无边框线，圆角 20px。
- **磨砂玻璃**：仅顶栏导航使用，`rgba(245,242,236,0.72)` + `backdrop-filter: blur(12px)`（暗色模式 `rgba(29,28,26,0.72)`）。
- **暗色模式的深度**：阴影在暗底上不可见，改用 1px `rgba(255,255,255,0.06)` 细线勾勒表面。

## 6. 布局语法

- **留白即信任**：Landing 区块间距 96–120px，应用内区块间距 48–64px，页面左右边距 ≥ 8% 视口宽度。间距全部为 8px 的倍数。
- **分隔层级**：能用「空」分隔就不用线，能用线就不用框。列表（联系人、设置项、行为维度）一律用 1px 竹青灰横线分隔的无框行——Cohere research-table 模式。
- **卡片克制**：真正需要卡片时才用瓷面卡（角色卡、登录框、Landing hero 展示）。禁止把每个区块都装进盒子。
- **非对称构图**：Landing 左文右图区块按 40% / 55% 分配，留 5% 呼吸间隙（宋瓷原案）。
- **圆形语言**：头像、图标按钮为正圆；主按钮为药丸形。
- **栅格**：桌面端角色卡与板块卡为 3 列；≤1024px 降 2 列；≤640px 降 1 列。

## 7. 组件规范

| 组件 | 规格 |
|---|---|
| 主按钮 | 玄墨底 + 宣纸白字，药丸形（radius 999px），内边距 12px 24px，14px 500。暗色模式反转为月白底玄墨字 |
| 次按钮 | 青瓷绿下划线文字链，无底色无边框 |
| 标签 chip | 藕荷 1px 描边药丸，内边距 6px 14px；**选中态 = 玄墨填充 + 月白字（「蘸墨」）**；hover 藕荷 10% 填充 |
| 输入框（砚台式） | 无框，仅底部 1px 竹青灰线；聚焦时底线变玄墨并自中心向两端晕开（0.4s）；登录/设置用此式 |
| 聊天输入区 | 同砚台式，置于磨砂底栏内 |
| AI 气泡 | 瓷面底 + 1px 竹青灰细线，圆角 20px（靠头像角 4px），17px 行高 1.8 |
| 用户气泡 | 藕荷填充 + 玄墨字，圆角同上 |
| 印章 | 「愛」字方章，印泥朱底月白字或朱色描边；尺寸按用途 32–48px，圆角 2px；用于品牌标识、Landing 角落、登录卡、空状态 |
| 图标 | 1.5px 线宽线性图标，圆端点（`stroke-linecap: round`），不用填充图标 |
| 顶栏导航 | 磨砂玻璃，三区布局：logo 左 / 链接中 / 操作右（Cohere 语法） |
| 无框列表行 | 上下 16–20px 内边距，1px 竹青灰底线，hover 时背景瓷面色；用于联系人、设置项、维度选择 |
| 黛墨色带 | 全宽，黛墨底月白字，上下内边距 80–96px，内部卡片用 `rgba(255,255,255,0.05)` 底 + `rgba(233,228,218,0.12)` 细线 |
| 空状态 | 印章 + 一句宋体短语 + 次按钮，不放插画 |
| 焦点环（无障碍） | 2px 青瓷绿 outline，offset 2px，全部可交互元素 |

## 8. 动效

全站统一缓动 `cubic-bezier(0.22, 0.61, 0.36, 1)`，手感慢而柔：

| 场景 | 动效 | 时长 |
|---|---|---|
| 页面/区块进入 | 自下方 20px 淡入上浮，仅播一次 | 0.6s |
| 聊天气泡出现 | 底部滑入渐显 | 0.35s |
| 按钮/卡片悬停 | 上浮 2px + 阴影加深 | 0.3s |
| 路由切换 | 交叉淡化 | 0.3s |
| 输入框聚焦 | 底线自中心向两端晕开 | 0.4s |
| chip 选中 | 背景色过渡（蘸墨） | 0.25s |

- 原宋瓷方案的「水墨晕染页面过渡」为可选增强项，不进主规范。
- 全站尊重 `prefers-reduced-motion: reduce`，命中时禁用位移动画。

## 9. 页面应用蓝图

| 页面 | 路由 | 蓝图 |
|---|---|---|
| Landing（新增） | `/welcome` | 磨砂导航 → hero：巨型宋体标题 + 副文案 + 玄墨药丸 CTA + 青瓷文字链，右侧/下方为聊天界面瓷面卡展示（暖色版 agent-console-card）→ 六个预设角色 3 列编辑式网格 → 黛墨色带展示性格定制 → 玄墨 Footer 带印章。未登录访问 `/` 重定向到此 |
| 登录 | `/login` | 宣纸画布居中瓷面卡，印章 logo，砚台式输入框 |
| 注册 | `/register` | 同登录 |
| Portal | `/` | 宋体 section-display 问候语 + 板块瓷面卡 3 列网格 |
| 选角页 | `/chat` | 3 列无框角色卡：顶部细线 + 圆形头像 + 宋体角色名 + 藕荷标签（capability-card 模式） |
| 创建页 | `/create` | 性格大类无框分区 + 特质 chips（选中蘸墨）；行为维度为细线分隔行 |
| 聊天页 | `/chat/:id` | 磨砂顶栏；联系人侧栏无框行；气泡见组件规范；时间戳与「正在输入…」用 mono-label；输入区砚台式 |
| 设置页 | `/settings` | 全部为细线分隔的无框设置行；主题切换改为 纸/砚 双选 |

## 10. 设计 Token（可直接落入 index.css）

```css
:root {
  /* 色彩 · 纸 */
  --color-paper: #F5F2EC;      /* 宣纸白 画布 */
  --color-porcelain: #FBF9F5;  /* 瓷面 卡片表面 */
  --color-ink: #2B2B2B;        /* 玄墨 主文字/主按钮 */
  --color-ink-2: #7A756B;      /* 古铜灰 次级文字 */
  --color-ink-3: #A39C90;      /* 灰陶 弱文字 */
  --color-band: #182420;       /* 黛墨 深色带 */
  --color-celadon: #46685B;    /* 青瓷绿 链接/正向/聚焦 */
  --color-lotus: #B8A89A;      /* 藕荷 强调/悬停/用户气泡 */
  --color-hairline: #D9D3C9;   /* 竹青灰 细线 */
  --color-seal: #A63A2B;       /* 印泥朱 印章/警示 */
  --color-moon: #E9E4DA;       /* 月白 深色带上的文字 */

  /* 字体 */
  --font-display-cn: "Qingbai Serif SC", "Source Han Serif SC", "Noto Serif SC", "Songti SC", serif;
  --font-display-en: "Space Grotesk", var(--font-display-cn);
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;
  --font-body: -apple-system, "PingFang SC", "MiSans", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif;

  /* 字距 */
  --tracking-cn: 0.04em;
  --tracking-en: -0.02em;
  --tracking-mono: 0.08em;

  /* 间距（8px 基数） */
  --space-1: 8px;  --space-2: 16px; --space-3: 24px; --space-4: 32px;
  --space-6: 48px; --space-8: 64px; --space-12: 96px; --space-15: 120px;

  /* 圆角 */
  --radius-sm: 8px;    /* 小图、小媒体 */
  --radius-md: 20px;   /* 卡片、气泡 */
  --radius-full: 999px;/* 药丸、头像 */

  /* 阴影与高光 */
  --shadow-card: 0 4px 24px rgba(43, 43, 43, 0.06);
  --shadow-float: 0 8px 32px rgba(43, 43, 43, 0.10);
  --glaze: inset 0 0 0 1px rgba(255, 255, 255, 0.6); /* 釉面内高光 */

  /* 磨砂 */
  --glass-bg: rgba(245, 242, 236, 0.72);
  --glass-blur: blur(12px);

  /* 动效 */
  --ease-soft: cubic-bezier(0.22, 0.61, 0.36, 1);
  --dur-fast: 0.3s; --dur-med: 0.4s; --dur-slow: 0.6s;
}

[data-theme="dark"] {
  --color-paper: #1D1C1A;
  --color-porcelain: #282623;
  --color-ink: #E9E4DA;
  --color-ink-2: #A29A8C;
  --color-ink-3: #6E685E;
  --color-band: #131917;
  --color-celadon: #7FA08F;
  --color-lotus: #C2B2A3;
  --color-hairline: #3A3733;
  --color-seal: #C05C4A;
  --color-moon: #E9E4DA;
  --shadow-card: none;
  --shadow-float: none;
  --glaze: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  --glass-bg: rgba(29, 28, 26, 0.72);
}
```

## 11. 落地方式

1. **重写 `client/src/index.css`**：写入上方全部 Token + 组件基类（`.btn-primary` `.btn-link` `.chip` `.card-porcelain` `.input-inkstone` `.row-hairline` `.band-dark` `.mono-label` 等）。主题只保留 `:root`（纸）与 `[data-theme="dark"]`（砚），删除 warm/green 两套变量。
2. **字体依赖**：npm 安装 `@fontsource/noto-serif-sc` `@fontsource/space-grotesk` `@fontsource/ibm-plex-mono`，在 `main.jsx` 引入所需字重的 CSS。
3. **逐页迁移**：各页面的 JS 内联样式对象迁移到 CSS 类（迁移顺序在实施计划中定义）。
4. **设置页主题切换**：从四选一改为 纸/砚 双模式切换；数据库 `users.theme` 字段沿用，取值收敛为 `light`/`dark`（存量其他值按 `light` 处理）。
5. **新增 Landing 路由 `/welcome`**：未登录访问 `/` 重定向到 `/welcome`。

## 12. Do & Don't

**Do**

- 宣纸白做默认画布，黛墨带只做 Landing 节奏与 Footer。
- 主 CTA 永远玄墨药丸；次级动作用青瓷绿文字链。
- 列表用细线无框行，卡片只留给真正的「物」（角色、板块、登录）。
- 中文标题正字距、西文标题负字距，让双语对比可见。
- mono-label 承担一切系统性小标记（时间、状态、日期分隔）。

**Don't**

- 不用高饱和色、渐变底色、重阴影。
- 不把印泥朱做大面积填充或按钮底色。
- 不给每个区块加边框盒子；不在应用内部使用深色带。
- 不用粗体堆层级；正文不用 webfont。
- 不做快而弹的动效；一切位移动画 ≤ 20px、时长 ≥ 0.25s。

## 13. 范围外（本次不做）

- 水墨晕染页面过渡（可选增强项，另行评估）。
- Live2D / 角色立绘等媒体资产。
- 移动端原生适配之外的专门优化（响应式栅格已覆盖基本场景）。
- 营销物料（海报、社交图）的延展规范。

---

> 实施顺序建议：Token 与字体基建 → Landing 页（新建，验证语法完整性）→ 登录/注册 → Portal/选角/创建 → 聊天 → 设置与主题收敛。具体任务拆分见实施计划文档。


