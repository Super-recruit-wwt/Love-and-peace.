# Love and Peace

一个 AI 驱动的情感陪伴平台。核心是三个并列的「板块」，由同一个 Node.js 后端 + React 前端承载。

| 板块 | 定位 | 入口路由 |
|------|------|---------|
| **板块一 · AI 陪伴聊天** | 类微信的情感陪伴对话，可定制 AI 角色 | `/chat` |
| **板块二 · 众声** | 多 AI 人格圆桌讨论（多主体辩论） | `/voices` |
| **板块三 · 修仙模拟人生** | 文字叙事修仙模拟游戏 | `/xianxia` |

三者共用同一个登录/用户体系、鉴权、数据库和 LLM 基础设施，通过门户页 `PortalPage`（`/`）作为统一入口。

---

## 技术栈与基础配置

**后端**（`server/`）：Node.js + Express + SQLite（`better-sqlite3`，WAL 模式），JWT 鉴权 + bcrypt 密码加密，`nodemailer` 邮件验证，`openai` SDK 对接大模型。

**前端**（`client/`）：React 18 + Vite 5 + React Router v6，懒加载路由。

**LLM 配置**（见 `server/.env`）：

- 供应商：DeepSeek（`https://api.deepseek.com/v1`，模型 `deepseek-chat`），走 OpenAI 兼容协议
- 模型层统一封装在 `server/src/llm.js`

**其他关键配置**：

- 端口 `3001`，JWT 密钥（7 天有效期）
- SMTP：163 邮箱（用于注册验证码 / 密码重置）
- 数据库文件：`server/data/love-and-peace.db`

**视觉设计**：采用自研设计系统「**青白 Qingbai**」——「宋瓷为魂、Cohere 为骨」，只有「纸(light)/砚(dark)」双主题（原四套通用主题已删除）。字体用 Noto Serif SC + Space Grotesk + IBM Plex Mono。详见 `docs/superpowers/specs/2026-07-19-qingbai-design-system-design.md`。

---

## 目录结构

```
f:\boo\001 网址
├── client/                 前端 (React + Vite)
│   ├── src/pages/          各页面（auth/chat/voices/xianxia 等）
│   ├── src/pages/xianxia/  修仙板块全部页面组件
│   ├── src/AuthContext.jsx 登录态上下文
│   └── vite.config.js
├── server/                 后端 (Express + SQLite)
│   ├── src/index.js        入口：注册路由 + 静态托管 + 优雅停机
│   ├── src/db/             数据库 schema + 兼容迁移
│   ├── src/routes/         auth / characters / chat / user / voices / xianxia
│   ├── src/xianxia/        修仙游戏引擎（核心逻辑模块）
│   ├── src/llm.js          LLM 封装 + 人格/情感/记忆压缩
│   ├── config/             personas / presets / locations 配置
│   └── .env                环境变量（含密钥，未被 git 跟踪）
├── docs/                   设计文档 + 小说事件提取资料
├── 同行参考/               参考项目 character-sim（未 git 跟踪）
├── 板块-AI讨论群/          「众声」板块的 Python 原型（未 git 跟踪）
├── 网址风格设计/            视觉风格调研资料（宋瓷美学 + Cohere）
├── deploy.sh               一键部署脚本
└── ecosystem.config.js     PM2 生产配置
```

---

## 三大板块功能详解

### 板块一 · AI 陪伴聊天

- **账号体系**：`server/src/routes/auth.js` 注册/登录/邮箱验证/密码重置，JWT 鉴权。
- **角色系统**：6 个预设角色（`server/config/presets.json`）+ 自定义角色。自定义通过「九轴性格模型」（温暖度、主见性、开放性等 0–1 连续值）+ 原型/维度映射，推导 MBTI、用语文风、情绪状态，最终合成结构化 System Prompt（见 `server/src/llm.js` 的 `buildSystemPrompt`）。
- **情感引擎**：情绪状态（心情/能量/压力/自信/社交电量）随对话关键词刺激动态变化并持久化；支持角色主动发起消息（`proactive`）。
- **记忆系统**：对话历史 + 主观视角记忆压缩（`compressMemory`）+ 内心独白（`generateInternalMonologue`）+ 不可变事实日志（`ground_truth_log`）用于调试记忆漂移。
- **页面**：Landing / Login / Register / Reset / Verify / HomePage（角色列表）/ CreatePage（定制）/ ChatPage（聊天）/ Settings。

### 板块二 · 众声（多 AI 圆桌讨论）

- 从 `板块-AI讨论群/` 的 Python 原型迁移而来（`discussionReply` 逻辑一致）。
- 支持 5 个预设人格（AI 科学家、哲学家、金融学家、奥运冠军、计算机科学家，见 `server/config/personas.json`）围绕议题多轮发言，可注入背景资料（`knowledge`）、用户插话、指定发言人。
- 数据表：`discussions` / `discussion_participants` / `discussion_messages`，支持全站示例回放（`is_sample`）。
- 页面：VoicesListPage / VoicesNewPage / VoicesRoomPage。

### 板块三 · 修仙模拟人生（体量最大的板块）

一个「选择决定一切」的文字叙事修仙游戏，玩家从出生开始、自由探索、突破境界、可死亡传世或飞升通关。核心设计文档见 `docs/xianxia-life-sim-design.md`（800 行）。

后端引擎在 `server/src/xianxia/`：

| 模块 | 职责 |
|------|------|
| `breakthrough.js` | 五路线突破机制（仙道天劫/肉身劫/诡道异化/匠道心血之作/散修顿悟） |
| `scripts/*.js` | 18 个「剧本模板」：修炼、炼丹、拜师、探索、战斗、贸易、旅行等——确定性数值推演 + LLM 叙事包装的混合架构 |
| `npc.js` / `npc_behavior.js` | NPC 生成、隐藏好感度关系、半主动行为 |
| `events.js` / `chronicle.js` | 世界事件、机缘奇遇 |
| `jade.js` | 传讯玉符（角色↔NPC 私信） |
| `techniques.js` / `insight.js` / `world.js` | 功法、悟性、世界状态 |

关键机制：五条修炼路线、随机灵根、三元属性（精/气/神）、倒计时锁（与现实时间挂钩的突破/炼制）、隐藏数值（好感度/气运只通过叙事暗示）、三种传世方式（夺舍/道统/转世）、MD 人生叙事导出。数据库约 15 张 `xianxia_*` 表，含大量兼容旧库的自动迁移逻辑（见 `server/src/db/schema.js`）。

页面：CharList / Birth / Main（三栏）/ Profile / Map / Journal / Jade / Legacy。

---

## 数据库结构

SQLite 单文件，三大板块表通过 `user_id` 关联（见 `server/src/db/schema.js`）：

- **通用**：`users`、`verification_tokens`
- **板块一**：`characters`、`emotional_state`、`messages`、`condensed_memories`、`ground_truth_log`
- **板块二**：`discussions`、`discussion_participants`、`discussion_messages`
- **板块三**：`xianxia_characters`、`xianxia_timeline`、`xianxia_npcs`、`xianxia_relationships`、`xianxia_world_state`、`xianxia_items`、`xianxia_legacy`、`xianxia_completed_runs`、`xianxia_jade_threads`、`xianxia_jade_messages`

`safeAddColumn` 提供白名单校验的自动加列迁移，部署脚本每次上线会自动同步。

---

## 部署配置

- **PM2**：`ecosystem.config.js`，生产路径 `/opt/love-and-peace`，端口 3001，内存 500M 自动重启，日志写入 `/var/log/love-and-peace/`。
- **一键部署**：`deploy.sh` 六步：git 同步 → 前端依赖 → 构建 → 后端依赖 → 数据库同步 → PM2 reload。
- **生产环境**：后端同时托管前端静态文件（`client/dist`）并做 SPA fallback。

---

## 需要注意的两点

1. **密钥安全**：`server/.env` 里含真实的大模型 API Key 和 SMTP 邮箱授权码。它已被 `.gitignore` 排除、未进 git，但存在于工作目录中——注意别在分享/截图时泄露。
2. **非代码资料未纳入版本控制**：`同行参考/`、`板块-AI讨论群/`、`网址风格设计/` 三个目录以及 `task_plan.md` 等规划文件都在 `.gitignore` 里，属于本地参考/过程资料，不随仓库同步。
