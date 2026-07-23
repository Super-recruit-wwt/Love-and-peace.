# 修仙模拟人生 — 实施计划

> 基于 2026-07-22 所有设计讨论整理 | 按阶段排序，每阶段可独立提交

---

## Phase 1: 数据库改造

### 1.1 xianxia_characters 新增列

```sql
ALTER TABLE xianxia_characters ADD COLUMN essence REAL NOT NULL DEFAULT 40;  -- 精（肉身）
ALTER TABLE xianxia_characters ADD COLUMN spirit REAL NOT NULL DEFAULT 30;    -- 神（神识）
-- qi_max 复用为「气」（法术）

ALTER TABLE xianxia_characters ADD COLUMN strange_corruption REAL DEFAULT 0;   -- 异化度 0-100
ALTER TABLE xianxia_characters ADD COLUMN special_equipment TEXT DEFAULT '[]'; -- 特殊装备 JSON 数组
```

**改动文件**: `server/src/db.js` — 在 xianxia_characters 建表语句中加入新列，并添加 `safeAddColumn` 兼容迁移。

### 1.2 xianxia_items 扩展

```sql
-- 新增字段（通过 safeAddColumn 兼容旧库）
ALTER TABLE xianxia_items ADD COLUMN attack REAL;
ALTER TABLE xianxia_items ADD COLUMN defense REAL;
ALTER TABLE xianxia_items ADD COLUMN slot TEXT;        -- weapon/armor/accessory/artifact/null
ALTER TABLE xianxia_items ADD COLUMN effect TEXT;       -- 特殊效果 JSON
ALTER TABLE xianxia_items ADD COLUMN durability REAL;
ALTER TABLE xianxia_items ADD COLUMN max_durability REAL;
ALTER TABLE xianxia_items ADD COLUMN req_essence REAL;
ALTER TABLE xianxia_items ADD COLUMN req_qi REAL;
ALTER TABLE xianxia_items ADD COLUMN req_spirit REAL;
```

**改动文件**: `server/src/db.js`

### 1.3 种子数据 — 播种功法/丹药/符箓表

新建 `server/src/xianxia/seeds/` 目录，存放 3 个数据文件：

- `techniques.json` — 全部功法（心法 18 + 术法 31 + 身法 13 + 秘术 12 + 诡术 8）= 82 部
- `pills.json` — 全部丹药 21 种（含材料和炼丹门槛）
- `talismans.json` — 全部符箓 16 种（含材料和炼制门槛）
- `materials.json` — 全部材料 26 种（含直接服用效果和炼制用途）

在 `world.js` 或新建 `seeds/index.js` 中，服务端启动时把这些种子数据写入 `xianxia_items` 表（作为"系统物品模板"，character_id = NULL）。

**改动文件**: 新建 `server/src/xianxia/seeds/` 下的 5 个文件，修改 `world.js` 或 `index.js` 的初始化流程。

---

## Phase 2: 精、气、神三元属性落地

### 2.1 创建角色时初始值生成

修改 `server/src/xianxia/index.js` 的 `createCharacter`：

```javascript
// 精气神初始值（出生随机）
const essence = Math.floor(Math.random() * 40) + 30;  // 30-70
const spirit = Math.floor(Math.random() * 30) + 20;    // 20-50
// qi_max 已在 cultivation_routine 首次修炼时设为 100
```

### 2.2 所有剧本加入精气神修正

每个剧本的 `resolve()` 开头读取 `character.essence/spirit`，按设计文档的交互矩阵修正数值。

| 剧本 | 精的修正 | 气的修正 | 神的修正 |
|------|---------|---------|---------|
| cultivation_routine | 精<20 修炼超 30 天→身体透支 | 效率公式含气 | 突破契机概率含神 |
| breakthrough_attempt | 精<30 禁突破，精高缩短 timer | 灵气需满 80% | 神<30 成功率减半，神≥100 突破后神+5 |
| breakthrough 结算 | 精≥120 "部分成功"降级为半成功 | — | 精≥80 且神≥80 失败后道心不减 |
| alchemy_craft | 精低→炼丹消耗体力更大 | 成功率含气 | 品质提升概率含神 |
| explore_location | 精低→受伤概率 | 灵石数量含气 | 线索发现加权含神 |
| gather_materials | 精高→多采 | — | 神高→稀有材料 |
| npc_talk | 精≥80→多一个"感知暗伤"option | — | 神≥80→可感知对方真实态度 |
| challenge_duel | 战力公式含精，败方受伤含精 | 战力公式含气 | 平局神≥100 偷学，败方精≥80 逆转 |
| sect_join | 精≥100→体修破格录取 | 评分公式含气 | — |
| trade | 精≥80→多"搬运打工"option | — | 神≥80→讲价优惠 |
| travel | 精高→缩短，精≥100 反杀劫匪 | — | 神≥80→旅途情报 |

**改动文件**: 12 个剧本文件（`scripts/*.js`）+ `breakthrough.js` + `llm.js`（applyOutcome）

---

## Phase 3: 功法学习与升级脚本

### 3.1 新建 `scripts/learn_technique.js`

**匹配**: `/学习.*功法|参悟.*法|修炼.*经|研习|翻阅.*秘籍/`

**resolve**:
- 从背包中找到指定的功法物品
- 检查门槛（精/气/神/境界）
- 学习速度按功法类型受精气神修正
- 功法记录到角色 cultivation_paths 的扩展结构里

### 3.2 新建 `scripts/upgrade_technique.js`

**匹配**: `/参悟|领悟.*功法|悟道|提升.*法|研习.*心得|提升.*境界/`

**resolve**:
- 选择一部已习得的功法
- 按功法类型受精气神修正升级速度
- 升级判定：初窥→小成→大成→圆满→自创变式

### 3.3 xianxia_characters 新增列

```sql
ALTER TABLE xianxia_characters ADD COLUMN learned_techniques TEXT DEFAULT '[]';
-- JSON: [{ name, type, grade, depth, equipped }]
```

**改动文件**: 新建 2 个剧本文件，修改 `db.js`，修改 `scripts/index.js`（注册剧本）

---

## Phase 4: 物品使用 API

### 4.1 POST /api/xianxia/characters/:id/use-item

```javascript
// body: { itemId }
// 校验角色拥有该物品 → 根据 item_type 执行效果
// pill: 应用丹药效果 + 扣除物品
// talisman: 应用符箓效果 + 扣除物品
// material: 直接服用 → 应用 rawEffect + 扣除物品
// equipment: 切换 is_equipped
```

### 4.2 前端右侧面板 — 物品快捷操作

在 `MainPage.jsx` 的右侧面板底部，新增物品展示区和"服用"/"使用"按钮。点击后调 `POST /use-item`。

**改动文件**: `server/src/xianxia/index.js`（新增路由）、`client/src/pages/xianxia/MainPage.jsx`

---

## Phase 5: 特殊装备落脚

### 5.1 special_equipment 数据定义

新建 `server/src/xianxia/seeds/special_equipment.json`，8 件特殊装备的完整数据。

### 5.2 特殊装备效果在各剧本中的判定

每个特殊装备的效果是一个条件分支——"如果角色的 special_equipment 里包含此装备，则执行此修正"。

| 装备 | 改动文件 |
|------|----------|
| 灵视之瞳 | `npc_talk.js` |
| 盗天机 | `explore_location.js` |
| 轻身符骨 | `travel.js` |
| 欺天面 | `sect_join.js` |
| 聚气玉 | `cultivation_routine.js` |
| 纳物佩 | `llm.js`（applyOutcome） |
| 破障丹方 | `breakthrough_attempt.js` + `breakthrough.js` |
| 往生符 | `llm.js`（死亡判定） |

**改动文件**: 8 个，每个约 5-10 行条件分支

---

## Phase 6: 负面状态系统

### 6.1 body_status 字段改为 JSON 数组

在 `llm.js` 的 `applyOutcome` 中，`body_status` 操作改为：

```javascript
// 读取当前 body_status JSON
// 追加/移除状态
// 写入新的 JSON
```

### 6.2 各剧本中的状态读取

在每个剧本的 `resolve()` 开头，解析 `body_status` JSON，根据生效状态修正数值。规则按设计文档的矩阵执行。

**改动文件**: 12 个剧本文件 + `breakthrough.js` + `llm.js`

---

## Phase 7: 诡道路线

### 7.1 异化度推进逻辑

在 `processAction` 和 `applyOutcome` 中：
- 累计 elapsedDays → 每 30 天异化度 +1（如异化度 > 10）
- 阈值穿越检测 → 写入被动叙事

### 7.2 新增 3 个诡道剧本

- `scripts/strange_ponder.js`
- `scripts/strange_contact.js`
- `scripts/strange_use_power.js`

### 7.3 诡道突破结算

修改 `breakthrough.js`：
- `advanceCultivation` 支持 `strange` 路线
- `resolveBreakthroughResult` 新增诡道分支

**改动文件**: `llm.js`、`breakthrough.js`、`index.js`、`scripts/index.js`、新建 3 个剧本

---

## Phase 8: NPC 半主动行为

新建 `server/src/xianxia/npc_behavior.js`：
- `triggerNpcBehavior(characterId)` — 8% 概率触发
- 6 种行为类型的判定和模板叙事

在 `index.js` 的 `processAction` 结尾调用。

**改动文件**: 新建 1 个文件，修改 `index.js`

---

## Phase 9: 死亡后操作

### 9.1 死亡时前端拦截

`MainPage.jsx` 的 `handleAction` 中，当 `res.died === true` 时，不渲染错误，而是显示死亡叙事 + 选项（导出 MD / 查看传世记录 / 返回角色列表）。

### 9.2 LegacyPage 补充交互

- 传世方式选择（转世重修 / 夺舍 / 道统）
- 转世重修 → 创建新角色，注入继承数据

**改动文件**: `MainPage.jsx`、`LegacyPage.jsx`、`index.js`（新增传世 API）

---

## Phase 10: 丹药/符箓炼制扩展

现有 `alchemy_craft.js` 只做了成功率判定，需要补上材料消耗、具体产出物品写入。

### 10.1 alchemy_craft 改造

- 读取种子数据，找到玩家想炼制的丹方
- 检查材料是否齐全
- 扣除材料 + 写丹药到背包

### 10.2 新建 talisman_craft.js

结构和 alchemy_craft 一致，用符箓技能判定。

**改动文件**: `alchemy_craft.js`、新建 `talisman_craft.js`、修改 `scripts/index.js`

---

## Phase 11: 前端全面更新

### 11.1 右侧面板重构

- 精、气、神三元展示（替代当前生命/灵力）
- 功法区：已习得功法列表（名称+品级+领悟深度）
- 物品区：装备、丹药、符箓、材料折叠展示
- 特殊装备区：独立展示
- 身体状态区：负面状态列表 + 治愈按钮

### 11.2 ProfilePage 完善

- 完整属性面板（含精气神 + 所有副职业技能）
- 功法详情（每部的效果说明 + 升级按钮）
- 物品详情（每件的效果说明 + 使用按钮）

### 11.3 MapPage 和 JournalPage 填充

- MapPage：五区域简图，已知地点标记
- JournalPage：世界事件日志 + NPC 关系网

**改动文件**: `MainPage.jsx`、`MainPage.css`、`ProfilePage.jsx`、`MapPage.jsx`、`JournalPage.jsx`、`xianxia-common.css`

---

## 执行顺序建议

| 优先级 | Phase | 原因 |
|--------|-------|------|
| P0 | Phase 1（DB） | 所有后续改动的基石 |
| P0 | Phase 6（负面状态） | DB 已经支持，只是把 body_status 改成 JSON，影响面广 |
| P1 | Phase 2（精气神落地） | 12 个剧本都要改但每次改动很小 |
| P1 | Phase 4（物品使用 API） | 玩家能实际使用背包里的东西 |
| P2 | Phase 7（诡道路线） | 需要 Phase 4 的物品基础 |
| P2 | Phase 8（NPC 行为） | 独立模块，耦合度低 |
| P2 | Phase 5（特殊装备） | 8 个文件的轻量改动 |
| P3 | Phase 3（功法学习） | 需要 Phase 2 的精气神修正 |
| P3 | Phase 9（死亡操作） | 依赖多个其他 Phase |
| P3 | Phase 10（炼制扩展） | 依赖 Phase 1 的种子数据 |
| P4 | Phase 11（前端更新） | 依赖所有后端改动 |
