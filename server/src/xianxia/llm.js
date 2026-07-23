// 修仙模拟人生 — LLM 集成核心
// System Prompt 构造、游戏主循环、出生叙事生成、记忆压缩

// 确保读取 .env（模块可能被独立加载）
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const OpenAI = require('openai');
const { db } = require('../db');
const scripts = require('./scripts');
const npcEngine = require('./npc');
const { isValidLocation, withBreakthroughOption, consumeBuffs, parseJson } = require('./scripts/utils');
const techniques = require('./techniques');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    if (!apiKey) throw new Error('LLM_API_KEY 环境变量未设置');
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

// ==================== System Prompt 组件库 ====================

const PROMPT_WORLD = `你是一个修仙世界的叙事引擎。这个世界名为"苍玄界"（或由当前叙事上下文决定的名称），是一块广袤的大陆，分为中州、北荒、南疆、东海、西漠五大区域。世界中有正道宗门、魔道势力、散修组织、隐世势力和凡人国度共存。

你的任务是：根据玩家的输入和当前角色的状态，生成一段生动、沉浸的中文叙事文字。叙事应当：
- 以第三人称描写角色所处的场景和发生的事件
- 语言风格偏向经典仙侠小说的叙事口吻，不堆砌辞藻但要有画面感
- 尊重修仙世界的内在逻辑——修为差距、功法克制、资源稀缺、机缘难求都是真实的
- 不替玩家做决定，只描述情景和可感知的线索
- 适当时留下悬念或开放性，让玩家自己决定下一步

世界中的势力包括但不限于：
- 中州：太虚剑宗（剑修祖庭）、浑天宗（气修正统）、丹霞谷（炼丹第一门）、天机阁（阵法情报）、万兽山（御兽）、金刚寺（佛修体修）
- 万象商会（跨区域贸易）、暗香楼（情报暗杀）、猎妖盟（佣兵）、天工坊（炼器）、丹师会（丹师评级）、云来城（散修城）
- 北荒：铁骨门（苦修体修）、寒冰宗（冰系正宗）、血河宗（邪修）、深渊裂隙（诡道源头）
- 南疆：万毒教（毒修）、蛊神宗（蛊修）、青木宗（采药炼丹）、雾中村（诡道现象）
- 东海：碧水宫（水系正宗）、龙血殿（血脉体修）、黑水港（自由港）、海底古遗迹、虚海（诡道现象）
- 西漠：搬山宗（凡人力修）、白骨观（邪修）、三大凡人王朝（大周/北朔/西凉）、地下古矿脉
- 隐世势力：龙族后裔、天劫幸存者、远古神兽`;

const PROMPT_CULTIVATION = `修炼体系有五条路线，角色可走其中一条或多条融合：

1. 仙道正统：炼气→筑基→金丹→元婴→化神→炼虚→合体→大乘→渡劫飞升。每境分初期/中期/后期/圆满四小阶。突破需渡天劫，天劫中有心魔试炼和雷劫。
2. 肉身成圣：铜皮→铁骨→银血→金身→玉髓→金刚→不灭→万象→肉身成圣。突破方式是肉身劫——在极端环境中让身体承受极限后再生。
3. 诡道：初触→共生→同化→深渊→化诡→噬主→规则掌控。接触不可名状之物，每进一步离"人"远一步。不可逆。
4. 凡人匠道：学徒→匠师→大师→宗师→圣手→开派祖师。以炼器/炼丹/阵法/符箓/商会贸易立足。
5. 散修野路子：凡俗→初窥→小成→大成→一方豪强→半步飞升。无体系，靠奇遇和实战自然晋升。

邪修与诡道的区别：邪修仍有功法门派，只是手段残忍（血炼、夺舍、炼尸等）；诡道则在修炼体系之外，力量来源于接触和污染。`;

const PROMPT_COMBAT = `战斗系统：没有独立的战斗界面。玩家描述行动，你根据双方的修为差距、功法克制、法宝加持、状态修正和随机波动来推演结果。战斗结果分为三个档次：
- 优势（玩家方明显占优）：描述玩家的行动取得良好效果
- 均势（双方势均力敌）：描述胶着的交锋，为下一回合留悬念
- 劣势（玩家方明显不敌）：描述玩家陷入危险，留逃生或翻盘的可能性（除非差距悬殊到毫无悬念）

战斗描写应该有紧张感和画面感，但不是每一刀每一剑都要写——把握节奏。`;

const PROMPT_NPC = `NPC 系统：
- 重要 NPC（宗门掌门、关键人物）有固定性格和立场
- 路人 NPC 根据场景按需生成
- NPC 对玩家的态度由隐藏的好感度（-100到+100）和关系类型（师徒/挚友/道侣/仇敌/竞争者等）决定
- NPC 的言行自然地暗示他们对玩家的态度，不给数字
- NPC 有半主动行为：仇敌可能寻仇、师父可能传信、道侣可能因久未见而离开

NPC 人格类型参考：严师（严格沉默）、慈师（温和鼓励）、劲敌（不服但尊重）、宿敌（不共戴天）、挚友（无条件支持但有底线）、道侣（深情但情感复杂）、商人（笑脸精明）、信息贩子（话只说七分）、隐世高人（随性说谜语）、权谋者（滴水不漏）、痴人（只关心自己领域）、惶恐者（被诡道异化的修士）、冷酷派（冷到不讲人情）。`;

const PROMPT_BREAKTHROUGH = `突破机制：突破不是按键，是叙事事件。系统会给玩家暗示"你感到体内的力量开始波动"，玩家决定什么时候冲击。突破过程中有1-3个关键抉择（硬抗还是取巧、面对还是逃避等）。突破可能失败——失败后果从轻微倒退到即死都有可能，取决于境界高低。

突破与时间锁：突破时界面上会出倒计时。你可以每隔一段时间生成一句"时间流逝叙事"——比如灵力运转了几个周天、丹田里的修为渐渐凝聚——让等待有画面感。`;

const PROMPT_EVENTS = `奇遇与世界事件：
- 奇遇以"模糊线索"的形式出现在叙事中（茶馆闲聊、路人对话、古籍残页），玩家注意到后可以选择追踪或忽略
- 世界事件是势力间的独立变化——宗门摩擦、秘境现世、瘟疫、妖兽潮——这些事会在叙事中自然体现
- 两种都可以用"你在某处偶然听到……""最近坊间传闻……"这类方式引入，不需要弹窗式的系统提示`;

// ==================== 组件式 Prompt 组装 ====================

function buildXianxiaPrompt(character, sceneType) {
  const parts = [PROMPT_WORLD];
  parts.push(PROMPT_CULTIVATION);

  // 按场景类型动态加载规则组件
  switch (sceneType) {
    case 'combat': parts.push(PROMPT_COMBAT); break;
    case 'npc_interact': parts.push(PROMPT_NPC); break;
    case 'breakthrough': parts.push(PROMPT_BREAKTHROUGH); break;
    case 'exploration': parts.push(PROMPT_EVENTS); break;
    default: parts.push(PROMPT_NPC, PROMPT_EVENTS); break;
  }

  // 角色当前状态
  parts.push(buildCharacterState(character));

  // 叙事指令
  parts.push(buildNarrativeDirective(character));

  return parts.join('\n\n---\n\n');
}

function buildCharacterState(character) {
  const cultivation = character.cultivation_paths || {};
  const roots = character.spirit_roots || {};

  const lines = [];
  lines.push(`\n## 当前角色状态\n`);
  lines.push(`角色名：${character.name}`);
  lines.push(`年龄：${character.game_age}岁 | 寿元剩余：${character.lifespan_remaining}年`);
  lines.push(`所在地：${character.current_location}`);
  lines.push(`三元：精(体魄)=${character.essence || 40} / 气(灵力流转)=${character.qi || 40} / 神(神识)=${character.spirit || 30}`);
  lines.push(`出生：${character.birth_region}，${character.birth_background}`);

  // 灵根
  const rootStr = Object.entries(roots).map(([k, v]) => `${k}灵根(${v})`).join('、');
  lines.push(`灵根：${rootStr}${character.special_body ? ` | 特殊体质：${character.special_body}` : ''}`);

  // 修炼进度
  const pathLabels = [];
  if (cultivation.xiandao) pathLabels.push(`仙道·${cultivation.xiandao}`);
  if (cultivation.physical) pathLabels.push(`肉身·${cultivation.physical}`);
  if (cultivation.strange) pathLabels.push(`诡道·${cultivation.strange}`);
  if (cultivation.artisan) pathLabels.push(`匠道·${cultivation.artisan}`);
  if (cultivation.wanderer) pathLabels.push(`散修·${cultivation.wanderer}`);
  lines.push(`修炼路线：${pathLabels.length > 0 ? pathLabels.join(' | ') : '尚未踏入修炼之路'}`);

  // 核心属性
  lines.push(`生命：${character.health} | 灵力：${character.qi_current}/${character.qi_max}`);

  // 道心与悟性
  lines.push(`道心：${character.dao_heart} | 悟性：${character.comprehension} | 神识：${character.divine_sense}`);

  // 财富与声望
  lines.push(`灵石：${character.spirit_stones} | 名望：${character.fame} | 恶名：${character.infamy}`);

  // 负面状态
  if (character.body_status) {
    lines.push(`身体状态：${character.body_status}`);
  }

  return lines.join('\n');
}

function buildNarrativeDirective(character) {
  const age = character.game_age || 16;

  return `\n## 叙事指令

你现在需要为上述角色生成一段叙事。请遵守以下准则：

1. 以第三人称描述，语气自然，不要让角色"觉得自己在玩游戏"
2. 关注玩家输入的动作，推演合理的后果。如果动作有显著风险或需要判定（战斗、炼丹成败、潜行等），请在推演时体现不确定性
3. 如果场景涉及 NPC，根据 NPC 和角色的关系、好感度来自然地展现其态度——不直接暴露数字
4. 可以在叙事中埋入微小的世界线索（如坊间传闻、路人的只言片语），但不要让这些线索喧宾夺主
5. 叙事长度控制在 100-250 字，信息密度适中——不要信息轰炸，也不要空无一物
6. 在某些行动的结尾如果有明显的后续选择（追击还是撤退、应战还是谈判等），自然地用叙事引出这些可能性，但不要写成"你面临两个选择"这种格式——要让选择感从叙事中自然浮现
7. 【隐藏系统标记】只有当本段叙事中角色真正开始了一项需要现实时间等待的活动（闭关突破、渡劫、开炉炼丹、炼器等）时，才在叙事正文结束后单独一行输出标记：[TIMER:breakthrough:分钟数] 或 [TIMER:crafting:分钟数]，分钟数取 2-60 的整数（境界越高、工程越大，耗时越长）。系统会自动解析并剔除该行，玩家看不到。仅仅提及"突破""炼丹"等词语而并未真正开始时，绝对不要输出该标记。
8. 【隐藏系统标记】叙事正文结束后，必须在末尾输出两行隐藏标记（系统会自动解析剔除，玩家看不到）：
   - 第一行 [TIME: 耗时]：估算这个行动从开始到完成花费的全部游戏内时间（不是叙事片段的时间）。格式如 [TIME: 2时辰]、[TIME: 3天]、[TIME: 1月]、[TIME: 半年]。可用单位：时辰（=2小时）、天、月、年。参考标尺：观察四周、说几句话=1-2时辰；城内办一件事=半天到1天；去邻近村镇=2-5天；跨区域长途跋涉=10-60天；闭关修炼一段时间=1-6月；长期经营/修炼=1年以上。必须按行动内容对号估算，观察类行动绝对不要给"1年"，长途/闭关类行动绝对不要只给几个时辰。
   - 第二行 [OPTIONS: 选项一|选项二|选项三]：2-3 个玩家接下来可采取的行动建议。选项必须是你刚才写的这段叙事的直接延续，紧扣叙事中出现的具体元素——具名 NPC、具体地点、正在发生的事件、刚获得的物品。反例（绝对禁止）：「修炼」「继续」「打坐」「观察四周」这类放之四海皆准的通用建议；正例：「追上那个往码头去的灰衣人」「查看包袱里刚捡到的铜镜」「向张伯打听赤铁矿的来历」。每个 4-14 字，不要编号。

角色目前${age}岁。${age < 20 ? '少年意气，世界在你面前展开。' : age < 100 ? '你已在修仙路上走过一段距离，前路尚远。' : '岁月在你身上刻下了印记，你已不是当初那个少年。'}`;
}

// ==================== 场景类型判定 ====================

function detectSceneType(userInput) {
  const combatWords = ['攻击', '杀', '偷袭', '出手', '斩杀', '对决', '应战', '迎战', '出剑', '施法', '祭出', '捏诀', '还击', '反击', '迎敌', '搏命', '拼命'];
  const npcWords = ['问', '打听', '询问', '拜访', '求见', '搭话', '交谈', '见面', '找', '寻'];

  const text = userInput.toLowerCase();
  if (combatWords.some(w => text.includes(w))) return 'combat';
  if (npcWords.some(w => text.includes(w))) return 'npc_interact';
  return 'default';
}

// ==================== 游戏主循环：行动处理（三层管线） ====================

/**
 * 入口：意图识别（规则）→ 命中剧本走数值推演管线，否则走 free_narrative 管线
 */
async function processAction(characterId, userInput) {
  const openai = getClient();
  const character = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!character) throw new Error('角色不存在');
  if (character.status !== 'active') throw new Error('角色已陨落或飞升');

  const matched = scripts.matchScript(userInput, character);
  if (matched) {
    return processScripted(openai, character, userInput, matched);
  }
  return processFreeNarrative(openai, character, userInput);
}

// ---------- 剧本通道：数值由服务端确定，LLM 只写文字 ----------

/** delta 列的可行域（qi_current 上限另按 qi_max 处理） */
const DELTA_BOUNDS = {
  health: [0, 100], dao_heart: [0, 100], comprehension: [0, 100],
  alchemy_skill: [0, 100], crafting_skill: [0, 100], formation_skill: [0, 100], talisman_skill: [0, 100],
  essence: [0, 999], qi: [0, 999], spirit: [0, 999],
  spirit_stones: [0, Infinity], fame: [0, Infinity], infamy: [0, Infinity],
  qi_current: [0, Infinity], qi_max: [0, Infinity],
};

const DELTA_LABELS = {
  qi_current: '修为', health: '生命', spirit_stones: '灵石', fame: '名望',
  infamy: '恶名', dao_heart: '道心', comprehension: '悟性', alchemy_skill: '炼丹',
  crafting_skill: '炼器', formation_skill: '阵法', talisman_skill: '符箓',
  essence: '精', qi: '气', spirit: '神', lifespan_remaining: '寿元',
};

function formatDaysCN(days) {
  if (days < 1) return `${Math.max(1, Math.round(days * 12))}时辰`;
  if (days < 30) return `${Math.round(days)}天`;
  if (days < 365) return `${(days / 30).toFixed(days % 30 >= 15 ? 0 : 0)}个月`;
  return `${(days / 365).toFixed(1)}年`;
}

/** 从剧本结果构建收益摘要行 */
function buildRewards(outcome) {
  const rewards = [];
  for (const [k, v] of Object.entries(outcome.deltas || {})) {
    if (!v) continue;
    const label = DELTA_LABELS[k] || k;
    rewards.push({ text: `${label} ${v > 0 ? '+' : ''}${Math.round(v)}`, tone: v > 0 ? 'gain' : 'loss' });
  }
  for (const item of outcome.items || []) {
    rewards.push({ text: `获得 ${item.name}`, tone: 'gain' });
  }
  // 剧本自定义附加收益行（如"修为已满"）
  for (const extra of outcome.extraRewards || []) {
    rewards.push(extra);
  }
  rewards.push({ text: `耗时 ${formatDaysCN(outcome.elapsedDays)}`, tone: 'time' });
  return rewards;
}

/**
 * 合并剧本通道选项：LLM 上下文选项优先；剧本的功法类功能选项（含《…》的转修/参悟/施展等，
 * 点击后须精确命中剧本路由）始终保留。llmOptions 为空时原样退回剧本静态选项。
 */
function mergeScriptOptions(llmOptions, staticOptions) {
  const statik = (staticOptions || []).filter(Boolean);
  if (!llmOptions || llmOptions.length === 0) return statik.slice(0, 4);
  // 功能项先占位（已在 LLM 选项中的不重复），LLM 选项用剩余名额——功能项永不被挤掉
  const functional = statik.filter(o => /《.+》/.test(o) && !llmOptions.includes(o)).slice(0, 4);
  return [...llmOptions.slice(0, Math.max(0, 4 - functional.length)), ...functional];
}

/** OPTIONS 标记统一正则：兼容半角 [OPTIONS: …] 与全角 【OPTIONS：…】、全角竖线 */
const OPTIONS_MARKER_STRIP_RE = /\s*[\[【]\s*OPTIONS\s*[:：][^\]】]*[\]】]\s*/gi;

/** 剔除一切隐藏标记（scripted 通道不信任 LLM 输出的任何标记） */
function stripMarkers(text) {
  return (text || '')
    .replace(/\s*\[TIMER:\s*(breakthrough|crafting)\s*:\s*\d{1,3}\s*\]\s*/gi, '')
    .replace(OPTIONS_MARKER_STRIP_RE, '')
    .replace(/\s*\[TIME:[^\]]*\]\s*/gi, '')
    .trim();
}

async function processScripted(openai, character, userInput, { script, params }) {
  // 第二层：数值推演（代码判定）
  const outcome = script.resolve(character, params, userInput);
  const rewards = buildRewards(outcome);

  const result = {
    scriptId: script.id,
    // 过滤空选项及与本次输入雷同的选项（避免"点完还在"的不自洽）
    options: (() => {
      const opts = (outcome.options || []).filter(o => o && o !== userInput);
      return opts.length > 0 ? opts : null;
    })(),
    time_spent_days: outcome.elapsedDays,
    deltas: outcome.deltas || {},
    rewards,
  };

  const characterId = character.id;

  // 数值应用 + 时间推进 + 死亡判定 + 玩家行动入库 + 计时器设置（同事务）
  const applyOutcome = db.transaction(() => {
    // deltas（带边界 clamp，qi_current 额外受 qi_max 约束）
    const setsMap = { ...(outcome.sets || {}) };
    for (const [key, delta] of Object.entries(outcome.deltas || {})) {
      const bounds = DELTA_BOUNDS[key] || [-Infinity, Infinity];
      let val = (character[key] || 0) + delta;
      val = Math.min(bounds[1], Math.max(bounds[0], val));
      if (key === 'qi_current') {
        const cap = setsMap.qi_max ?? character.qi_max ?? 0;
        if (cap > 0) val = Math.min(cap, val);
      }
      setsMap[key] = val;
    }
    // 被动回血：剧本未直接治疗（无 health delta）且非损耗类行动，按耗时回复
    // 修炼类每天 +5，其余非战斗行动每天 +2；战斗/损耗（health delta 为负）当天不回复
    const healthDelta = (outcome.deltas || {}).health;
    if (healthDelta === undefined && (outcome.elapsedDays || 0) >= 0.5) {
      const perDay = script.id === 'cultivation_routine' ? 5 : 2;
      const regen = Math.floor(outcome.elapsedDays * perDay);
      if (regen > 0) {
        const curHealth = setsMap.health ?? character.health ?? 100;
        const newHealth = Math.min(100, curHealth + regen);
        if (newHealth > curHealth) {
          setsMap.health = newHealth;
          rewards.push({ text: `生命 +${newHealth - curHealth}`, tone: 'gain' });
        }
      }
    }
    // current_location 兜底校验：非法地名（如"城休整"）拒绝写入，防脏数据
    if (setsMap.current_location !== undefined && !isValidLocation(setsMap.current_location)) {
      console.warn(`[scripted] 拒绝写入非法位置 "${setsMap.current_location}"（剧本 ${script.id}）`);
      delete setsMap.current_location;
    }
    // 按行动次数消耗的 buff（暴气丹/神念丹 3_actions）：每次行动 -1，耗尽移除
    const curBuffs = setsMap.active_buffs !== undefined
      ? parseJson(setsMap.active_buffs, [])
      : parseJson(character.active_buffs, []);
    if (curBuffs.some(b => b.unit === 'actions')) {
      setsMap.active_buffs = JSON.stringify(consumeBuffs({ active_buffs: JSON.stringify(curBuffs) }, 'actions'));
    }
    if (Object.keys(setsMap).length > 0) {
      const cols = Object.keys(setsMap).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE xianxia_characters SET ${cols} WHERE id = ?`)
        .run(...Object.values(setsMap), characterId);
    }

    // 物品增减
    for (const item of outcome.items || []) {
      db.prepare(
        `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, slot, attack, defense, effect)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(characterId, item.name, item.item_type || 'misc', item.grade || '凡品', item.description || null,
        item.slot || null, item.attack ?? null, item.defense ?? null, item.effect || null);
    }
    for (const itemId of outcome.removeItemIds || []) {
      db.prepare('DELETE FROM xianxia_items WHERE id = ? AND character_id = ?').run(itemId, characterId);
    }

    // NPC 好感度（固定 delta 规则，接 npc.js）
    for (const e of outcome.npcEffects || []) {
      npcEngine.applyAffectionChange(characterId, e.npcId, e.delta, e.reason);
    }

    // 时间推进 + 死亡判定 + 异化度被动扩散
    const elapsedYears = outcome.elapsedDays / 365;
    const newAge = (character.game_age || 16) + elapsedYears;
    const newLifespan = character.lifespan_remaining - elapsedYears;
    const gameTime = formatGameAge(newAge);
    result.gameTime = gameTime;

    // 异化度被动扩散：每累计30天+1（异化度>10时）
    const corr = character.strange_corruption || 0;
    let newCorruption = corr;
    if (corr > 10 && outcome.elapsedDays >= 0.5) {
      const corruptionTicks = Math.floor(outcome.elapsedDays / 30);
      if (corruptionTicks > 0 && corr < 100) {
        newCorruption = Math.min(100, corr + corruptionTicks);
      }
    }

    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
    ).run(characterId, gameTime, 'action', userInput);

    if (newLifespan <= 0) {
      const cultivation = JSON.parse(character.cultivation_paths || '{}');
      const finalCultivation = Object.values(cultivation).filter(Boolean).join('、') || '未入道门';
      const deathNarrative = '寿元已尽。这一世的路走到了尽头，求道者闭上了眼睛，坐化于岁月长河之中。';
      db.prepare(
        `UPDATE xianxia_characters SET game_age = ?, lifespan_remaining = 0, status = 'dead',
         timer_type = NULL, timer_end_at = NULL, timer_narrative = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(newAge, characterId);
      db.prepare(
        'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
      ).run(characterId, gameTime, 'death', deathNarrative);
      db.prepare(
        'INSERT INTO xianxia_legacy (character_id, death_cause, death_narrative, final_cultivation, final_age, legacy_type) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(characterId, '寿元耗尽', deathNarrative, finalCultivation, Math.floor(newAge), 'natural_death');
      result.died = true;
      result.deathNarrative = deathNarrative;
    } else {
      db.prepare(
        `UPDATE xianxia_characters SET game_age = ?, lifespan_remaining = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newAge, newLifespan, characterId);
    }

    // 异化度变更写入
    if (newCorruption !== corr) {
      db.prepare("UPDATE xianxia_characters SET strange_corruption = ?, updated_at = datetime('now') WHERE id = ?")
        .run(newCorruption, characterId);
    }

    // 计时器：由服务端直接设置（不经 LLM 标记）
    if (outcome.timer && !result.died) {
      const endAt = new Date(Date.now() + outcome.timer.minutes * 60 * 1000).toISOString();
      db.prepare(
        `UPDATE xianxia_characters SET timer_type = ?, timer_end_at = ?, timer_narrative = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(outcome.timer.type, endAt, outcome.timer.narrative, characterId);
      result.timerSet = {
        type: outcome.timer.type,
        remaining: outcome.timer.minutes * 60,
        narrative: outcome.timer.narrative,
      };
    }
  });
  applyOutcome();

  // options 统一出口：修为满时首位保证"冲击瓶颈"（用结算后的最新修为状态判定）
  const afterChar = db.prepare('SELECT qi_current, qi_max FROM xianxia_characters WHERE id = ?').get(characterId);
  result.options = withBreakthroughOption(afterChar, result.options);
  if (result.options.length === 0) result.options = null;

  // 第三层：LLM 叙事包装（失败兜底剧本白描文本与剧本静态选项，行动照常完成）
  // 同一次调用顺带产出贴合叙事的上下文选项；功法类功能选项（含《…》）始终保留
  let narrative = null;
  if (!result.died) {
    try {
      const raw = await renderScriptedNarrative(openai, character, userInput, outcome);
      const llmOptions = raw ? parseOptionsMarker(raw) : null;
      narrative = raw ? stripMarkers(raw) : null;
      if (llmOptions) {
        result.options = withBreakthroughOption(afterChar, mergeScriptOptions(llmOptions, outcome.options));
      }
    } catch (err) {
      console.error(`剧本叙事渲染失败 [${script.id}]，使用白描兜底:`, err.message);
      narrative = null;
    }
  }
  if (!narrative || narrative.length < 10) narrative = outcome.resultText;
  result.narrative = narrative;

  // 叙事事件落库（带 options 与收益摘要）
  db.prepare(
    'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative, options, rewards) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    characterId, result.gameTime, 'narrative', narrative,
    result.options ? JSON.stringify(result.options) : null,
    JSON.stringify(rewards)
  );

  return result;
}

/** 剧本通道的渲染 prompt：只写文字，结果必须与给定一致 */
async function renderScriptedNarrative(openai, character, userInput, outcome) {
  const cultivation = JSON.parse(character.cultivation_paths || '{}');
  const pathStr = Object.values(cultivation).filter(Boolean).join('、') || '凡俗之身';

  // 取最近 3 条叙事作为前情，避免无状态渲染导致同输入出同文
  const recent = db.prepare(
    "SELECT narrative FROM xianxia_timeline WHERE character_id = ? AND event_type = 'narrative' ORDER BY id DESC LIMIT 3"
  ).all(character.id).reverse();
  const prelude = recent.length > 0
    ? recent.map((r, i) => `${i + 1}. ${String(r.narrative).slice(0, 80)}`).join('\n')
    : '（暂无）';

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一位修仙小说叙事引擎。请根据以下【已确定的结果】写一段第三人称中文叙事。

角色：${character.name}，${pathStr}，${Math.floor(character.game_age || 16)}岁
地点：${character.current_location}
前情（最近发生的事件，仅供衔接）：
${prelude}
玩家的行动：${userInput}
已确定的结果：${outcome.resultText}

硬约束：
- 结果、成败、数值、收益必须与给定完全一致，不得更改
- 不得添加情节转折、意外发现、额外收益、新 NPC 的关键行为
- 紧接前情往下写，不得重复前情已描写过的场景、意象和句式；本次叙事必须把局面推进到新状态
- 第三人称，仙侠小说口吻，100-150 字，只写这一件事
- 正文结束后另起一行输出后续行动建议标记：[OPTIONS: 选项一|选项二|选项三]——必须是这段叙事的直接延续，紧扣叙事中出现的具体人物/地点/事件/物品，禁止"修炼""继续"这类泛泛建议，每个选项 4-12 字`,
      },
    ],
    temperature: 0.75,
    max_tokens: 400,
  });

  return response.choices[0].message.content;
}

// ---------- 自由叙事通道（保留现有标记协议） ----------

/**
 * 叙事已生成但 OPTIONS 标记缺失时的补偿：用叙事内容二次生成上下文选项。
 * 只输出标记行，由 parseOptionsMarker 解析；失败返回 null（调用方再退回地点通用项）。
 */
async function generateContextualOptions(openai, character, userInput, narrative) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: '你是修仙游戏的行动建议生成器。根据给出的叙事，提供 3 个玩家下一步可采取的具体行动。'
          + '要求：必须是这段叙事的直接延续，紧扣叙事中出现的具体人物/地点/事件/物品；'
          + '禁止"修炼""继续""打坐"这类与叙事无关的泛泛建议；每个选项 4-12 字。'
          + '只输出一行标记，不要输出任何其他内容：[OPTIONS: 选项一|选项二|选项三]',
      },
      {
        role: 'user',
        content: `地点：${character.current_location}\n玩家的行动：${userInput}\n叙事：${String(narrative).slice(-400)}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 100,
  });
  return parseOptionsMarker(response.choices[0].message.content || '');
}

async function processFreeNarrative(openai, character, userInput) {
  const characterId = character.id;

  // 准备上下文
  const sceneType = detectSceneType(userInput);
  const systemPrompt = buildXianxiaPrompt(character, sceneType);

  // 获取近期叙事
  const recent = db.prepare(
    'SELECT narrative FROM xianxia_timeline WHERE character_id = ? ORDER BY id DESC LIMIT 20'
  ).all(characterId);
  const recentHistory = recent.reverse().map(r => r.narrative).join('\n\n');

  // 获取远期记忆摘要
  const distantMemories = getDistantMemories(characterId);

  // 构建消息
  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  if (distantMemories) {
    messages.push({ role: 'system', content: `## 过去的记忆摘要\n${distantMemories}` });
  }

  if (recentHistory) {
    messages.push({ role: 'system', content: `## 近期经历\n${recentHistory}` });
  }

  // 输出格式提醒（紧邻用户输入，确保标记协议被执行）
  messages.push({
    role: 'system',
    content: `【输出格式提醒】你的回复必须先写叙事正文（100-250 字），正文结束后必须输出两行系统标记（玩家看不到，但协议必须输出）：
1. [TIME: 耗时]——估算玩家这个行动【从开始到完成】花费的全部游戏内时间（不是叙事片段的时间）。标尺：即时观察/对话=[TIME: 1时辰]~[TIME: 2时辰]；城内一件事=[TIME: 1天]；邻近村镇往返=[TIME: 3天]；长途跋涉=[TIME: 30天]；闭关修炼一段时间=[TIME: 3月]。按行动内容对号，长途和闭关严禁只给时辰级；
2. [OPTIONS: 选项一|选项二|选项三]——必须是你刚写的这段叙事的直接延续，紧扣叙事中出现的具体人物/地点/事件/物品；禁止"修炼""继续""打坐"这类与叙事无关的泛泛建议。
若角色真正开始了突破/闭关/炼丹等耗时活动，再另起一行 [TIMER:breakthrough:分钟数] 或 [TIMER:crafting:分钟数]。`
  });

  messages.push({ role: 'user', content: userInput });

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.8,
    max_tokens: 800,
  });

  let narrative = response.choices[0].message.content || '';

  // 解析隐藏标记，并从展示文本中剔除
  const timerTriggered = parseTimerMarker(narrative);
  let options = parseOptionsMarker(narrative);
  const timeSpent = parseTimeMarker(narrative);
  narrative = narrative
    .replace(/\s*\[TIMER:\s*(breakthrough|crafting)\s*:\s*\d{1,3}\s*\]\s*/gi, '')
    .replace(OPTIONS_MARKER_STRIP_RE, '')
    .replace(/\s*\[TIME:[^\]]*\]\s*/gi, '')
    .trim();

  // LLM 漏标/格式偏差导致无选项时，用叙事内容二次生成上下文选项（不再直接退回地点通用项）
  if (!options) {
    try {
      options = await generateContextualOptions(openai, character, userInput, narrative);
    } catch (e) { console.error('补充生成上下文选项失败:', e.message); }
  }

  // 耗时（天）：无标记或解析失败时保守默认 1 天
  const elapsedDays = timeSpent ? timeSpent.days : 1;

  // options 统一出口：修为满时首位保证"冲击瓶颈"（自由通道不改数值，用当前修为判定）
  const finalOptions = withBreakthroughOption(character, options);
  const result = { narrative, timerTriggered, options: finalOptions.length > 0 ? finalOptions : null, time_spent_days: elapsedDays };

  // 时间推进 + 死亡判定 + 落库（事务保证原子性；玩家行动与 AI 叙事一并入库，供决策回顾）
  const passTime = db.transaction(() => {
    const elapsedYears = elapsedDays / 365;
    const newAge = (character.game_age || 16) + elapsedYears;
    const newLifespan = character.lifespan_remaining - elapsedYears;
    const gameTime = formatGameAge(newAge);

    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
    ).run(characterId, gameTime, 'action', userInput);

    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative, options) VALUES (?, ?, ?, ?, ?)'
    ).run(characterId, gameTime, 'narrative', narrative, result.options ? JSON.stringify(result.options) : null);

    if (newLifespan <= 0) {
      // 寿元耗尽：死亡流程
      const cultivation = JSON.parse(character.cultivation_paths || '{}');
      const finalCultivation = Object.values(cultivation).filter(Boolean).join('、') || '未入道门';
      const deathNarrative = '寿元已尽。这一世的路走到了尽头，求道者闭上了眼睛，坐化于岁月长河之中。';

      db.prepare(
        `UPDATE xianxia_characters SET game_age = ?, lifespan_remaining = 0, status = 'dead',
         timer_type = NULL, timer_end_at = NULL, timer_narrative = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(newAge, characterId);

      db.prepare(
        'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
      ).run(characterId, gameTime, 'death', deathNarrative);

      db.prepare(
        'INSERT INTO xianxia_legacy (character_id, death_cause, death_narrative, final_cultivation, final_age, legacy_type) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(characterId, '寿元耗尽', deathNarrative, finalCultivation, Math.floor(newAge), 'natural_death');

      result.died = true;
      result.deathNarrative = deathNarrative;
    } else {
      db.prepare(
        `UPDATE xianxia_characters SET game_age = ?, lifespan_remaining = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newAge, newLifespan, characterId);
    }

    result.gameTime = gameTime;
  });
  passTime();

  // 自由匠艺（炼符/炼器/阵法等无剧本通道）：相关秘术功法触类旁通，主修秘术 ×1.5
  if (!result.died && /炼符|制符|绘符|画符|炼器|打造|布阵|阵法/.test(userInput)) {
    try {
      const secMain = techniques.getMainOfType(character, 'secret');
      const r = techniques.gainDepthExp(character, Math.max(3, Math.round(elapsedDays)), {
        type: 'secret', boostName: secMain && secMain.name, boostMult: 1.5, otherMult: 1,
      });
      if (r.gains.length > 0) {
        db.prepare("UPDATE xianxia_characters SET learned_techniques = ?, updated_at = datetime('now') WHERE id = ?")
          .run(JSON.stringify(r.list), characterId);
      }
    } catch (e) {
      console.error('匠艺功法经验失败:', e.message);
    }
  }

  // 定期触发记忆压缩（异步，不阻塞响应）
  const eventCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM xianxia_timeline WHERE character_id = ?'
  ).get(characterId);
  if (eventCount.cnt > 0 && eventCount.cnt % 20 === 0) {
    triggerMemoryCompression(characterId, systemPrompt).catch(e =>
      console.error('记忆压缩失败:', e.message)
    );
  }

  return result;
}

// ==================== 出生叙事生成 ====================

function getBirthPrompt(stage, character, choice) {
  const prompts = {
    birth: `你出生在${character.birth_region}的一个${character.birth_background}家庭。灵根测试的结果是：${Object.entries(character.spirit_roots || {}).map(([k, v]) => `${k}灵根资质${v}`).join('，')}。${character.special_body ? `你拥有特殊体质：${character.special_body}。` : ''}

请以第三人称生成一段约 150-200 字的出生叙事，描述这个婴儿降生的场景。不要有异象祥瑞（除非是极特殊出身），要写得真实、有温度、有人情味。这个婴儿未来会成为什么样的人，此刻还无人知晓。`,

    awakening: `六年过去了。你六岁了。

六岁这一年，你的天赋第一次真正显现。请生成一段约 150-200 字的叙事，描述天赋觉醒的场景。重点放在"孩子第一次意识到自己跟别人不一样"的那个瞬间——可能是一种陌生的感觉、一个无法解释的现象、或者某个大人的异常反应。结尾处留下余韵，让玩家感受到"从此之后，一切都将不同了"。`,

    choice: `十二岁。你需要做出第一个重要的人生抉择。

请生成一段约 150-200 字的叙事，描述这个十字路口。家里人的意见、周围环境的推力、你自己内心的犹疑——都要写出来。结尾给出三个明确的选项，用自然的方式呈现（比如母亲说了一件事、父亲说了另一件、而你心里还有一个声音）。这三个选项应该对应：①走向修炼之路 ②留在家里过凡人生活 ③独自闯荡不确定的未来。`,

    coming: `十六岁，你成年了。

请生成一段约 200-250 字的叙事，作为童年时期的总结和成人之路的开端。回顾过去十六年的成长，描述此刻站在人生路口的感受。要有告别童年的惆怅，也要有面对未知的期待。最后，以收拾行囊、踏上修仙之路作为结束。`,
  };

  return prompts[stage] || prompts.birth;
}

async function generateBirthNarrative(character, stage, choice) {
  const openai = getClient();
  let prompt = getBirthPrompt(stage, character, choice);
  if (choice) {
    prompt += `\n\n玩家在上一阶段做出的选择是：「${choice}」。请在叙事中自然地承接这个选择，让它对后续人生产生影响。`;
  }

  // 失败时直接抛错，由路由层返回 500，不写任何占位内容进时间线
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: '你是一个修仙世界的叙事引擎。请用优美的中文、第三人称视角、仙侠小说的叙事口吻，为玩家生成沉浸式的叙事文字。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.85,
    max_tokens: 600,
  });

  return response.choices[0].message.content;
}

// ==================== MD 导出 ====================

async function generateExportMD(characterId) {
  const openai = getClient();
  const character = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(characterId);
  if (!character) throw new Error('角色不存在');

  const timeline = db.prepare(
    'SELECT * FROM xianxia_timeline WHERE character_id = ? ORDER BY id ASC'
  ).all(characterId);

  if (timeline.length === 0) {
    return `# ${character.name} · 修仙人生\n\n暂无记录。`;
  }

  const allNarratives = timeline.map(t => t.narrative).join('\n\n');
  const cultivation = JSON.parse(character.cultivation_paths || '{}');
  const roots = JSON.parse(character.spirit_roots || '{}');

  const prompt = `你是一位修仙小说的说书人。请根据以下角色的人生记录，写一篇约 800-1500 字的"人物传记"，以小说叙述的口吻，总结这位求道者到目前为止的人生际遇。

## 基本信息
- 角色名：${character.name}
- 出生：${character.birth_region}，${character.birth_background}
- 灵根：${Object.entries(roots).map(([k, v]) => `${k}(${v})`).join(' ')}
- 修炼路线：${JSON.stringify(cultivation)}
- 年龄：${character.game_age}岁
- 状态：${character.status === 'active' ? '修行中' : character.status === 'dead' ? '已陨落' : '已飞升'}

## 人生经历
${allNarratives.slice(0, 8000)}

请以如下格式输出（Markdown）：

# ${character.name}传

（正文开始——以说书人的口吻，用第三人称叙述。语言优美但不刻意堆砌。要有情感起伏，既写大事件也写细微之处。可以适当地加入一些"留白"，让读者想象那些未被记录的时刻。）`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.error('MD 导出失败:', err.message);
    return `# ${character.name}传\n\n${character.name}，${character.birth_region}人氏，${character.birth_background}出身。\n\n（导出失败，请重试）`;
  }
}

// ==================== 记忆压缩 ====================

function getDistantMemories(characterId) {
  const memories = db.prepare(
    `SELECT narrative FROM xianxia_timeline
     WHERE character_id = ? AND event_type = 'memory_summary'
     ORDER BY id DESC LIMIT 5`
  ).all(characterId);

  if (memories.length === 0) return null;
  return memories.map(m => m.narrative).join('\n\n');
}

async function triggerMemoryCompression(characterId, systemPrompt) {
  const openai = getClient();

  // 取最近 20-40 条叙事中非总结的
  const recent = db.prepare(
    `SELECT narrative FROM xianxia_timeline
     WHERE character_id = ? AND event_type != 'memory_summary'
     ORDER BY id DESC LIMIT 30`
  ).all(characterId);

  if (recent.length < 10) return;

  const text = recent.reverse().map(r => r.narrative).join('\n\n');

  const prompt = `请以这个角色的主观视角，将以下经历压缩为一段不超过 300 字的记忆摘要。注意：
- 不是客观总结"发生了什么"，而是从角色的角度，记录"我是如何记住这些事的"
- 包含关键的情感体验、重要的人际互动、获得的信息或物品
- 如果有未完成的伏笔（约了某人在某地见面、答应做某件事还没做等），一定要写进去
- 不要用编号或列表，用连贯的自然语言

${text.slice(0, 4000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 500,
    });

    const summary = response.choices[0].message.content;
    const gameTime = `${new Date().toISOString()}`;

    db.prepare(
      'INSERT INTO xianxia_timeline (character_id, game_time, event_type, narrative) VALUES (?, ?, ?, ?)'
    ).run(characterId, gameTime, 'memory_summary', summary);
  } catch (err) {
    console.error('记忆压缩失败:', err.message);
  }
}

// ==================== 倒计时标记解析 ====================

/**
 * 解析 LLM 叙事末尾的隐藏结构化标记：[TIMER:breakthrough:分钟] / [TIMER:crafting:分钟]
 * 分钟数 clamp 到 0.25-15（精气神越高时间越短，修为越高时间越长）。返回的 duration 单位为秒。
 */
function parseTimerMarker(narrative) {
  const m = narrative.match(/\[TIMER:\s*(breakthrough|crafting)\s*:\s*(\d{1,3})\s*\]/i);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const minutes = Math.min(15, Math.max(0.25, parseInt(m[2], 10)));
  return {
    type,
    duration: minutes * 60,
    narrative: type === 'breakthrough' ? '突破进行中……' : '炼制进行中……',
  };
}

/**
 * 解析 LLM 叙事末尾的建议选项标记，兼容半角 [OPTIONS: 选项一|选项二] 与全角 【OPTIONS：选项一｜选项二】
 * 返回字符串数组（2-4 个，单个最长 30 字），无标记返回 null。
 */
function parseOptionsMarker(narrative) {
  const m = narrative.match(/[\[【]\s*OPTIONS\s*[:：]\s*([^\]】]*)[\]】]/i);
  if (!m) return null;
  const options = m[1]
    .split(/[|｜]/)
    .map(s => s.trim().replace(/^[\d①②③④⑤.\s、]+/, '').trim())
    .filter(s => s.length > 0)
    .slice(0, 4)
    .map(s => s.slice(0, 30));
  return options.length > 0 ? options : null;
}

/**
 * 解析 LLM 叙事末尾的耗时标记：[TIME: 3天] / [TIME: 2时辰] / [TIME: 半年]
 * 单位换算：时辰=2小时（1/12 天）、天/日=1、月=30 天、年=365 天。
 * 返回 { days }，clamp 在 0.05 ~ 365 天；无标记返回 null（调用方给保守默认）。
 */
const CN_NUM = { '半': 0.5, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

function parseTimeMarker(narrative) {
  const m = narrative.match(/\[TIME:\s*([\d.]+|半|一|二|两|三|四|五|六|七|八|九|十)\s*(时辰|天|日|月|年)\s*\]/i);
  if (!m) return null;
  let value = parseFloat(m[1]);
  if (isNaN(value)) value = CN_NUM[m[1]] || 1;
  const unit = m[2];
  let days;
  if (unit === '时辰') days = value / 12;
  else if (unit === '月') days = value * 30;
  else if (unit === '年') days = value * 365;
  else days = value; // 天/日
  days = Math.min(365, Math.max(0.05, days));
  return { days };
}

/** 浮点年龄格式化为「21岁3个月」可读形式（前后端保持一致） */
function formatGameAge(age) {
  const a = Number(age) || 0;
  const y = Math.floor(a);
  const m = Math.round((a - y) * 12);
  if (m <= 0) return `${y}岁`;
  if (m >= 12) return `${y + 1}岁`;
  return `${y}岁${m}个月`;
}

// ==================== 旅行叙事 ====================

async function generateTravelNarrative(fromLocation, toLocation, sameRegion) {
  const openai = getClient();
  var distance = sameRegion ? '同区域内' : '跨区域';
  var prompt = '你是一个修仙世界叙事引擎。请为以下旅行场景生成一段叙事文字（100-150字）：\n\n' +
    '角色从「' + fromLocation + '」出发，前往「' + toLocation + '」。\n' +
    '这次旅行是' + distance + '旅行。\n\n' +
    '要求：\n' +
    '- 以第三人称叙事\n' +
    '- 描述路途所见所感，带有修仙世界的氛围感\n' +
    '- 不添加意外事件或剧情转折，只是一段平静的旅途\n' +
    '- 如果距离较远，途中可以稍作休息描述';

  try {
    var response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    // LLM 失败时生成默认叙事
    var dir = sameRegion ? '向' : '远赴';
    return '你收拾行囊，' + dir + fromLocation.split('-').pop() + '出发，前往' + toLocation.split('-').pop() + '。一路上风尘仆仆，数日后终于抵达。';
  }
}
module.exports = {
  buildXianxiaPrompt,
  processAction,
  generateBirthNarrative,
  generateExportMD,
  detectSceneType,
  triggerMemoryCompression,
  parseTimerMarker,
  parseOptionsMarker,
  parseTimeMarker,
  formatGameAge,
  generateTravelNarrative,
  mergeScriptOptions,
};
