// 修仙模拟人生 — 奇遇与世界事件引擎

const { db } = require('../db');

// 奇遇线索模板
const EVENT_CLUES = [
  { text: '坊间传闻，苍梧山脉深处近来有异光冲天，深夜尤甚。', region: '中州', type: 'realm_emergence' },
  { text: '据说北荒某个废弃矿道里挖出了一块会说话的石头，听到的人都说石头的预言灵验了。', region: '北荒', type: 'strange_item' },
  { text: '南疆采药人说，密林里最近出现了一片"不该有"的湖——一个老采药人发誓上个月那里还是平地。', region: '南疆', type: 'strange_phenomenon' },
  { text: '东海渔民都在传：海底古遗迹的封印松动了，灵力波动已经把三艘渔船掀翻了。', region: '东海', type: 'realm_emergence' },
  { text: '西漠的商队说在大漠深处看到了"移动的废墟"——一座会自己走的古城，一转眼就不见了。', region: '西漠', type: 'wandering_ruin' },
  { text: '有人在云来城的黑市上出售一块残破的玉简，据说记载着远古丹方——没人买得起，也没人敢买。', region: '中州', type: 'rare_item' },
  { text: '铁骨门最近封山了。外面的人不知道发生了什么，有人猜测是门主在冲击更高境界，也有人说是北荒深处有什么东西在靠近。', region: '北荒', type: 'faction_event' },
  { text: '蛊神宗和万毒教在边界上打了一架，死了不少底层弟子。两边都在招新人——条件越好越可疑。', region: '南疆', type: 'faction_conflict' },
  { text: '黑水港最近多了很多陌生面孔——都是来问同一个问题的：谁在卖"虚质"？这是不该出现在市面上的东西。', region: '东海', type: 'strange_trade' },
  { text: '大周朝廷要修运河，征用了搬山宗的一片外围领地。搬山宗不说话，朝廷以为他们服软了——但朝廷不知道搬山宗沉默的时候才是最危险的。', region: '西漠', type: 'faction_event' },
];

// 世界事件模板（条件触发型）
const WORLD_EVENT_TEMPLATES = [
  {
    id: 'faction_war_minor',
    condition: (state) => {
      const relations = state.faction_relations || {};
      return Object.values(relations).some(r => r && r.tension >= 65);
    },
    generate: (state) => {
      const highTensions = Object.entries(state.faction_relations || {})
        .filter(([, r]) => r && r.tension >= 65);
      if (highTensions.length === 0) return null;
      const [pair] = highTensions[Math.floor(Math.random() * highTensions.length)];
      const [a, b] = pair.split('-');
      return {
        type: 'faction_war',
        title: `${a}与${b}爆发冲突`,
        narrative: `${a}与${b}之间的紧张局势终于升级为公开冲突。修真界的目光都聚焦在这场对峙上。`,
        affected_regions: ['中州'],
        consequence: `两大势力的对抗将波及周边区域，散修和低阶修士被卷入的风险急剧上升。`,
      };
    },
  },
  {
    id: 'realm_opens',
    condition: () => Math.random() < 0.3,
    generate: () => ({
      type: 'realm_open',
      title: '古秘境现世',
      narrative: '一座上古秘境的大门在某处缓缓开启。各宗各派的探子已经闻风而动——每一次秘境开启，都是一场腥风血雨的开端。',
      affected_regions: ['中州', '北荒', '南疆', '东海', '西漠'],
      consequence: '秘境中有上古传承和无尽危险。各势力都在组织探索队伍。',
    }),
  },
];

/**
 * 根据角色所在区域和运气生成一条奇遇线索
 */
function generateEventClue(characterLocation, fortune) {
  const regionClues = EVENT_CLUES.filter(c =>
    c.region === characterLocation.split('-')[0] || c.region === '中州'
  );
  const pool = regionClues.length > 0 ? regionClues : EVENT_CLUES;

  // 高气运：更容易出现稀有线索
  if (fortune >= 70 && Math.random() < 0.3) {
    const rare = pool.filter(c => c.type.includes('strange') || c.type.includes('rare'));
    if (rare.length > 0) return rare[Math.floor(Math.random() * rare.length)];
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 检查并推演世界事件
 */
function tickWorldEvents() {
  const rows = db.prepare('SELECT key, value FROM xianxia_world_state').all();
  const state = {};
  for (const row of rows) {
    try { state[row.key] = JSON.parse(row.value); }
    catch { state[row.key] = row.value; }
  }

  const newEvents = [];
  for (const template of WORLD_EVENT_TEMPLATES) {
    if (template.condition(state)) {
      const event = template.generate(state);
      if (event) newEvents.push(event);
    }
  }

  if (newEvents.length > 0) {
    const activeEvents = state.active_events || [];
    for (const evt of newEvents) {
      activeEvents.push({ ...evt, triggered_at: new Date().toISOString() });
    }
    db.prepare(
      "INSERT OR REPLACE INTO xianxia_world_state (key, value) VALUES ('active_events', ?)"
    ).run(JSON.stringify(activeEvents.slice(-20))); // 保留最近 20 条
  }

  return newEvents;
}

/**
 * 获取角色可知的世界事件（在角色当前位置附近发生的）
 */
function getRelevantWorldEvents(characterLocation) {
  const row = db.prepare("SELECT value FROM xianxia_world_state WHERE key = 'active_events'").get();
  if (!row) return [];

  try {
    const events = JSON.parse(row.value);
    const region = characterLocation.split('-')[0];
    return events.filter(e =>
      !e.affected_regions || e.affected_regions.includes(region)
    ).slice(-5);
  } catch {
    return [];
  }
}

module.exports = { EVENT_CLUES, generateEventClue, tickWorldEvents, getRelevantWorldEvents };
