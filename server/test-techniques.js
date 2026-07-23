// 功法系统冒烟测试（一次性脚本，验证后可删除）
const { db, init } = require('./src/db');
init();
require('./src/xianxia/seeds').seedAll();

const techniques = require('./src/xianxia/techniques');
const cultivation = require('./src/xianxia/scripts/cultivation_routine');
const sectJoin = require('./src/xianxia/scripts/sect_join');
const techSwitch = require('./src/xianxia/scripts/technique_switch');
const breakthrough = require('./src/xianxia/breakthrough');
const { qiMaxForStage } = require('./src/xianxia/scripts/utils');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- 1. 种子与模板 ----------
console.log('\n[1] 功法模板');
const tpl = techniques.getTemplate('吐纳基础');
check('吐纳基础模板存在', !!tpl);
check('effect.efficiency=1.0', tpl && tpl.effect.efficiency === 1.0);
const tai = techniques.getTemplate('太虚引气术');
check('太虚引气术 faction=太虚剑宗', tai && tai.faction === '太虚剑宗');
check('太虚引气术 req.roots 已持久化', tai && Array.isArray(tai.req.roots) && tai.req.roots.includes('金'));
const count = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND item_type='technique'").get().c;
check('模板总数 63（40 心法 + 23 杂学）', count === 63, `实际 ${count}`);
// 刷新式播种幂等：再跑一遍不应重复
require('./src/xianxia/seeds').seedAll();
const count2 = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND item_type='technique'").get().c;
check('重复播种不重复插入', count2 === 63, `实际 ${count2}`);

// ---------- 2. 学习 / 主修 ----------
console.log('\n[2] 学习与主修');
const baseChar = {
  learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, main: true }]),
  cultivation_paths: JSON.stringify({ xiandao: '炼气初期' }),
  spirit_roots: JSON.stringify({ 金: 80 }), // 太虚引气术 req.roots 含金/木，需任一契合
};
check('主修=吐纳基础', techniques.getMainTechnique(baseChar).name === '吐纳基础');
check('吐纳基础效率倍率=1', techniques.efficiencyMult(baseChar) === 1);
check('气海倍率=1', techniques.qiMaxMult(baseChar) === 1);

const r1 = techniques.learnTechnique(baseChar, '太虚引气术');
check('学习新功法 learned=true', r1.learned === true);
check('默认不抢主修', r1.becameMain === false);
const r2 = techniques.learnTechnique(baseChar, '吐纳基础');
check('重复学习 learned=false', r2.learned === false);

const char2 = { ...baseChar, learned_techniques: JSON.stringify(r1.list) };
const sw = techniques.switchMainTechnique(char2, '太虚引气术');
check('转修成功', sw.switched === true);
const char3 = { ...char2, learned_techniques: JSON.stringify(sw.list) };
check('转修后主修=太虚引气术', techniques.getMainTechnique(char3).name === '太虚引气术');
check('效率倍率=1.2', Math.abs(techniques.efficiencyMult(char3) - 1.2) < 1e-9);
check('气海倍率=250/150', Math.abs(techniques.qiMaxMult(char3) - 250 / 150) < 1e-9);
check('effectiveQiMax(炼气初期)=167', techniques.effectiveQiMax(char3) === Math.round(100 * 250 / 150));
const sw2 = techniques.switchMainTechnique(char3, '太虚引气术');
check('已是主修则 switched=false', sw2.switched === false);

// ---------- 3. 修炼剧本应用功法效率 ----------
console.log('\n[3] 修炼剧本');
function fakeChar(over) {
  return {
    id: 999999, game_age: 16, spirit_roots: JSON.stringify({ 金: 80 }), comprehension: 50,
    essence: 50, spirit: 50, qi: 50, qi_current: 0, qi_max: 100, dao_heart: 50,
    lifespan_remaining: 80, health: 100,
    cultivation_paths: JSON.stringify({ xiandao: '炼气初期' }),
    learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, main: true }]),
    active_buffs: '[]', body_status: null, current_location: '中州-无名小镇',
    ...over,
  };
}
const days = 10;
const outBase = cultivation.resolve(fakeChar(), { days });
const outTech = cultivation.resolve(fakeChar({
  learned_techniques: JSON.stringify([{ name: '太虚引气术', depth: 0, main: true }]),
}), { days });
check('功法效率生效（1.2×）', outTech.deltas.qi_current > outBase.deltas.qi_current,
  `基础 ${outBase.deltas.qi_current} vs 功法 ${outTech.deltas.qi_current}`);
check('比值≈1.2', Math.abs(outTech.deltas.qi_current / outBase.deltas.qi_current - 1.2) < 0.15,
  `比值 ${(outTech.deltas.qi_current / outBase.deltas.qi_current).toFixed(3)}`);
const outSlow = cultivation.resolve(fakeChar({
  learned_techniques: JSON.stringify([{ name: '搬山劲', depth: 0, main: true }]),
}), { days });
check('低效率功法（0.7×）进境更慢', outSlow.deltas.qi_current < outBase.deltas.qi_current,
  `基础 ${outBase.deltas.qi_current} vs 搬山劲 ${outSlow.deltas.qi_current}`);
// 新角色首次修炼初始化 qi_max = effectiveQiMax
const outNew = cultivation.resolve(fakeChar({
  qi_max: 0,
  learned_techniques: JSON.stringify([{ name: '太虚引气术', depth: 0, main: true }]),
}), { days: 1 });
check('首次修炼按功法初始化气海=167', outNew.sets && outNew.sets.qi_max === 167, `实际 ${outNew.sets && outNew.sets.qi_max}`);

// ---------- 4. 转修剧本 ----------
console.log('\n[4] 转修剧本');
const m1 = techSwitch.match('转修《太虚引气术》');
check('匹配《》功法名', m1 && m1.name === '太虚引气术');
const m2 = techSwitch.match('改修虚海心经');
check('匹配裸功法名', m2 && m2.name === '虚海心经');
const m3 = techSwitch.match('转修');
check('无名也给参数（列出已学）', m3 && m3.name === null);
const mNo = techSwitch.match('继续修炼');
check('不误伤普通修炼', mNo === null);
const charFull = fakeChar({
  qi_current: 200, qi_max: 167,
  learned_techniques: JSON.stringify([
    { name: '太虚引气术', depth: 0, main: true },
    { name: '吐纳基础', depth: 0, main: false },
  ]),
});
const swOut = techSwitch.resolve(charFull, { name: '吐纳基础' });
check('转修回吐纳基础 qi_max=100', swOut.sets && swOut.sets.qi_max === 100, `实际 ${swOut.sets && swOut.sets.qi_max}`);
check('超限修为散逸 qi_current=100', swOut.sets && swOut.sets.qi_current === 100, `实际 ${swOut.sets && swOut.sets.qi_current}`);
const swFail = techSwitch.resolve(charFull, { name: '诛仙剑经残卷' });
check('未学功法转修被拒', swFail.renderParams.outcome === 'not_learned');

// ---------- 5. 突破：qi_max 倍率 + 三元加成 ----------
console.log('\n[5] 突破结算');
const breakChar = fakeChar({
  dao_heart: 100, health: 100, essence: 80, spirit: 80, qi: 80,
  learned_techniques: JSON.stringify([{ name: '浑天心法', depth: 0, main: true }]), // qi_per_break 8 / spirit_per_break 5, qi_max 420
});
let sawGain = false, sawQiMax = false;
for (let i = 0; i < 30; i++) {
  const res = breakthrough.resolveBreakthroughResult(breakChar, 'breakthrough');
  if (res.success) {
    sawQiMax = res.newQiMax === Math.round(qiMaxForStage('炼气中期') * 420 / 150);
    if (res.statGains && res.statGains.qi === 11 && res.statGains.spirit === 8 && res.statGains.essence === 8) sawGain = true;
    break;
  }
}
check('突破成功 newQiMax 含功法倍率(×2.8)', sawQiMax);
check('突破成功三元=功法加成+境界基底（气8+3/神5+3/精5+3）', sawGain);

// ---------- 6. 入宗授予 ----------
console.log('\n[6] 入宗授予');
const joinChar = fakeChar({
  spirit_roots: JSON.stringify({ 金: 90 }), comprehension: 90, qi_max: 200,
  current_location: '中州-太虚剑宗',
});
let joined = null;
for (let i = 0; i < 50 && !joined; i++) {
  const out = sectJoin.resolve(joinChar);
  if (out.renderParams && out.renderParams.success) joined = out;
}
check('入宗成功（高资质）', !!joined);
if (joined) {
  const list = JSON.parse(joined.sets.learned_techniques);
  check('授予太虚引气术', list.some(e => e.name === '太虚引气术'), JSON.stringify(list));
  const extraNames = (joined.extraRewards || []).map(r => r.text).join(';');
  check('收益摘要含功法', extraNames.includes('太虚引气术'), extraNames);
}

// ==================== 深度体系 ====================

const ponder = require('./src/xianxia/scripts/technique_ponder');
const mentor = require('./src/xianxia/scripts/technique_mentor');
const duel = require('./src/xianxia/scripts/challenge_duel');

// ---------- 7. 深度经验与升级 ----------
console.log('\n[7] 深度经验与阈值');
{
  const char = fakeChar(); // 主修吐纳基础（凡品 [50,120,250,500]）
  const r1 = techniques.addDepthExp(char, '吐纳基础', 60);
  const e1 = r1.list.find(e => e.name === '吐纳基础');
  check('60 经验 → 小成', e1.depth === 1 && r1.levelUps.join() === '1', `depth=${e1.depth}`);
  const c2 = { ...char, learned_techniques: JSON.stringify(r1.list) };
  const r2 = techniques.addDepthExp(c2, '吐纳基础', 200); // 累计 260 → 大成(120)→圆满(250)
  const e2 = r2.list.find(e => e.name === '吐纳基础');
  check('累计 260 → 圆满', e2.depth === 3, `depth=${e2.depth} exp=${e2.exp}`);
  check('一次跳两级 levelUps=[2,3]', r2.levelUps.join() === '2,3', r2.levelUps.join());
  // 诡品不吃经验
  const strangeChar = fakeChar({
    strange_corruption: 65,
    learned_techniques: JSON.stringify([{ name: '虚海心经', depth: 0, exp: 0, main: true }]),
  });
  const r3 = techniques.addDepthExp(strangeChar, '虚海心经', 100);
  check('诡品不吃经验', r3.gained === 0);
  check('诡品深度随异化度(65→圆满)', techniques.getMainTechnique(strangeChar).depth === 3,
    `depth=${techniques.getMainTechnique(strangeChar).depth}`);
  // capDepth（师长指点上限）
  const holy = fakeChar({
    learned_techniques: JSON.stringify([{ name: '归元天书', depth: 2, exp: 700, main: true }]),
  });
  const r4 = techniques.addDepthExp(holy, '归元天书', 999, { capDepth: 2 });
  check('capDepth=2 圣品不再升级', r4.levelUps.length === 0 && r4.list[0].depth === 2);
}

// ---------- 8. 逐级解锁效果 ----------
console.log('\n[8] 逐级解锁');
{
  const mk = depth => fakeChar({
    learned_techniques: JSON.stringify([{ name: '太虚引气术', depth, exp: 0, main: true }]),
  });
  // 太虚引气术 effect: efficiency 1.2, qi_max 250, combat_bonus 0.1
  const u0 = techniques.unlockedEffect(mk(0));
  check('初窥只有基础项', u0.efficiency === 1.2 && u0.qi_max === 250 && !('combat_bonus' in u0), JSON.stringify(u0));
  const u1 = techniques.unlockedEffect(mk(1));
  check('小成解锁战斗项', Math.abs(u1.combat_bonus - 0.1) < 1e-9);
  // 玄冰真解: efficiency 1.4, qi_max 420, ice_slow(true 特殊机制)
  const mkIce = depth => fakeChar({
    learned_techniques: JSON.stringify([{ name: '玄冰真解', depth, exp: 0, main: true }]),
  });
  check('特殊机制需大成', !('ice_slow' in techniques.unlockedEffect(mkIce(1))) && techniques.unlockedEffect(mkIce(2)).ice_slow === true);
  const u3 = techniques.unlockedEffect(mk(0) && mk(3));
  check('圆满数值 ×1.1', Math.abs(u3.efficiency - 1.32) < 1e-9, `efficiency=${u3.efficiency}`);
}

// ---------- 9. 修炼挂机攒深度 ----------
console.log('\n[9] 修炼攒深度');
{
  const out = cultivation.resolve(fakeChar({ comprehension: 50 }), { days: 60 });
  const list = JSON.parse(out.sets.learned_techniques);
  const e = list.find(t => t.name === '吐纳基础');
  check('60 天修炼 → 60 经验 → 小成', e.depth === 1 && e.exp === 60, JSON.stringify(e));
  check('升级收益摘要', (out.extraRewards || []).some(r => r.text.includes('小成')));
  check('叙事含升级', out.resultText.includes('小成'));
}

// ---------- 10. 参悟剧本 ----------
console.log('\n[10] 参悟剧本');
{
  const m = ponder.match('参悟《太虚引气术》');
  check('参悟匹配功法名', m && m.name === '太虚引气术');
  const char = fakeChar({
    comprehension: 50,
    learned_techniques: JSON.stringify([{ name: '太虚引气术', depth: 0, exp: 0, main: true }]),
  });
  const out = ponder.resolve(char, { name: '太虚引气术' });
  const list = JSON.parse(out.sets.learned_techniques);
  const gained = list[0].exp;
  check('参悟获得经验(15~30)', gained >= 15 && gained <= 30, `exp=${gained}`);
  // 悟道丹 ×2
  const charPill = fakeChar({
    comprehension: 50,
    active_buffs: JSON.stringify([{ stat: 'insight_mult', value: 2, remaining: 1, unit: 'insight' }]),
    learned_techniques: JSON.stringify([{ name: '太虚引气术', depth: 0, exp: 0, main: true }]),
  });
  const outPill = ponder.resolve(charPill, { name: '太虚引气术' });
  const gainedPill = JSON.parse(outPill.sets.learned_techniques)[0].exp;
  check('悟道丹经验翻倍', gainedPill >= 30 && gainedPill <= 60, `exp=${gainedPill}`);
  check('悟道丹 buff 被消耗', JSON.parse(outPill.sets.active_buffs).length === 0);
  // 本宗地盘加成：loc 含 faction
  const charSect = fakeChar({
    comprehension: 50, current_location: '中州-太虚剑宗',
    learned_techniques: JSON.stringify([{ name: '太虚引气术', depth: 0, exp: 0, main: true }]),
  });
  let maxBase = 0;
  for (let i = 0; i < 50; i++) {
    const o = ponder.resolve(char, { name: '太虚引气术' });
    maxBase = Math.max(maxBase, JSON.parse(o.sets.learned_techniques)[0].exp);
  }
  const outSect = ponder.resolve(charSect, { name: '太虚引气术' });
  // 宗门内最高可达 30×1.5=45，高于宗门外最大值 30
  let sectHigher = false;
  for (let i = 0; i < 50; i++) {
    const o = ponder.resolve(charSect, { name: '太虚引气术' });
    if (JSON.parse(o.sets.learned_techniques)[0].exp > 30) { sectHigher = true; break; }
  }
  check('宗门内参悟加成 ×1.5', sectHigher);
  // 诡品无法参悟
  const strangeChar = fakeChar({
    strange_corruption: 65,
    learned_techniques: JSON.stringify([{ name: '虚海心经', depth: 0, exp: 0, main: true }]),
  });
  const outStrange = ponder.resolve(strangeChar, { name: '虚海心经' });
  check('诡品不可参悟', outStrange.renderParams.outcome === 'strange_technique');
  // 悟道丹已入种子
  check('悟道丹已播种', !!db.prepare("SELECT id FROM xianxia_items WHERE character_id IS NULL AND item_type='pill' AND name='悟道丹'").get());
}

// ---------- 11. 突破深度经验 ----------
console.log('\n[11] 突破深度经验');
{
  const char = fakeChar({
    dao_heart: 100, health: 100, essence: 80, spirit: 80, qi: 80,
    learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, exp: 40, main: true }]),
  });
  let depthSeen = null;
  for (let i = 0; i < 80 && !depthSeen; i++) {
    const res = breakthrough.resolveBreakthroughResult(char, 'breakthrough');
    // 取完全成功档（newLifespan 仅完全成功携带）：炼气初期→中期非跨境界，+30
    if (res.success && res.newLifespan && res.techniqueDepth) depthSeen = res;
  }
  check('突破成功携带深度经验', !!depthSeen);
  if (depthSeen) {
    const e = depthSeen.techniqueDepth.list.find(t => t.name === '吐纳基础');
    check('exp 40+30=70 → 小成', e.exp === 70 && e.depth === 1, JSON.stringify(e));
    check('升级叙事', depthSeen.narrative.includes('小成'));
  }
  // 失败也给 +5
  const failChar = fakeChar({ dao_heart: 1, health: 10, spirit: 1, qi: 1 });
  let failDepth = null;
  for (let i = 0; i < 60 && !failDepth; i++) {
    const res = breakthrough.resolveBreakthroughResult(failChar, 'breakthrough');
    if (!res.success && !res.died && res.techniqueDepth) failDepth = res;
  }
  check('突破失败 +5 体悟', !!failDepth && failDepth.techniqueDepth.list[0].exp === 5,
    failDepth ? JSON.stringify(failDepth.techniqueDepth.list[0]) : '无');
}

// ---------- 12. 战中顿悟 ----------
console.log('\n[12] 战中顿悟');
{
  const char = fakeChar();
  let insight = false;
  for (let i = 0; i < 300 && !insight; i++) {
    const out = duel.resolve(char);
    if ((out.extraRewards || []).some(r => r.text.includes('战中顿悟'))) insight = true;
  }
  check('300 次切磋内出现顿悟', insight);
  // 散修概率更高（统计 500 场散修 vs 非散修）
  const wanderer = fakeChar({ cultivation_paths: JSON.stringify({ xiandao: '炼气初期', wanderer: '散修' }) });
  let wCnt = 0, nCnt = 0;
  for (let i = 0; i < 500; i++) {
    if ((duel.resolve(wanderer).extraRewards || []).some(r => r.text.includes('战中顿悟'))) wCnt++;
    if ((duel.resolve(char).extraRewards || []).some(r => r.text.includes('战中顿悟'))) nCnt++;
  }
  check('散修顿悟率更高', wCnt > nCnt, `散修 ${wCnt} vs 普通 ${nCnt}`);
}

// ---------- 13. 求教师长 ----------
console.log('\n[13] 求教师长');
{
  require('./src/xianxia/world').seedAll();
  const npc = db.prepare("SELECT * FROM xianxia_npcs WHERE faction='太虚剑宗' AND is_alive=1 ORDER BY id LIMIT 1").get();
  check('太虚剑宗 NPC 存在', !!npc);
  const m = mentor.match('向长老求教功法');
  check('求教匹配', !!m);
  check('普通请教不误伤', mentor.match('向他请教炼丹') === null);

  if (npc) {
    // 建临时用户+角色（FK 约束），测试后清理
    const email = `test_mentor_${Date.now()}@t.local`;
    const u = db.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)').run(email, 'x', '测试');
    const uid = u.lastInsertRowid;
    const c = db.prepare(
      `INSERT INTO xianxia_characters (user_id, name, birth_region, birth_background, learned_techniques, comprehension)
       VALUES (?, '测试修士', '中州', '凡人农家', ?, 50)`
    ).run(uid, JSON.stringify([{ name: '太虚引气术', depth: 0, exp: 0, main: true }]));
    const cid = c.lastInsertRowid;

    const charRow = db.prepare('SELECT * FROM xianxia_characters WHERE id = ?').get(cid);
    // 好感不足
    const low = mentor.resolve(charRow);
    check('好感不足被拒', low.renderParams.outcome === 'low_affection');
    // 好感足够
    db.prepare('INSERT INTO xianxia_relationships (character_id, npc_id, affection) VALUES (?, ?, 50)').run(cid, npc.id);
    const ok = mentor.resolve(charRow);
    check('指点获得经验', ok.renderParams.outcome === 'mentored' && JSON.parse(ok.sets.learned_techniques)[0].exp === 40,
      JSON.stringify(ok.renderParams));
    check('消耗好感 -10', ok.npcEffects[0].delta === -10 && ok.npcEffects[0].npcId === npc.id);
    // 散修功法无师长
    const charWanderer = { ...charRow, learned_techniques: JSON.stringify([{ name: '青云心法', depth: 0, exp: 0, main: true }]) };
    check('散修功法无师长', mentor.resolve(charWanderer).renderParams.outcome === 'no_mentor');

    db.prepare('DELETE FROM xianxia_characters WHERE id = ?').run(cid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  }
}

// ---------- 14. 术法/身法/秘术/诡术 ----------
console.log('\n[14] 术法/身法/秘术/诡术');
{
  const secret = require('./src/xianxia/scripts/technique_secret');
  const travel = require('./src/xianxia/scripts/travel');
  const trade = require('./src/xianxia/scripts/trade');
  const explore = require('./src/xianxia/scripts/explore_location');

  const total = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND item_type='technique'").get().c;
  check('模板总数 63（40 心法 + 23 杂学）', total === 63, `实际 ${total}`);

  // 术法不可主修
  const spellOnly = fakeChar({
    learned_techniques: JSON.stringify([{ name: '七式快剑', depth: 0, exp: 0, main: false }]),
  });
  check('只学术法则无主修心法', techniques.getMainTechnique(spellOnly) === null);
  check('学习首部术法自动成术法主修', (() => {
    const r = techniques.learnTechnique(fakeChar({ learned_techniques: '[]' }), '七式快剑');
    return r.learned && r.becameMain && r.list[0].main;
  })());
  check('术法可设为类型主修', techniques.switchMainTechnique(spellOnly, '七式快剑').switched === true);

  // 战力聚合
  const fighter = fakeChar({
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true },
      { name: '七式快剑', depth: 0, exp: 0, main: false },
      { name: '玄水盾', depth: 0, exp: 0, main: false },
      { name: '踏雪无痕', depth: 0, exp: 0, main: false },
    ]),
  });
  const arts = techniques.combatArts(fighter);
  check('术法攻击 8 / 防御 12 / 身法闪避 0.1', arts.attack === 8 && arts.defense === 12 && Math.abs(arts.dodge - 0.1) < 1e-9,
    JSON.stringify(arts));
  check('术法 pierce 初窥未解锁', !('pierce' in techniques.learnedArts(fighter, 'spell')[0].effect));
  const fighter2 = { ...fighter, learned_techniques: JSON.stringify([
    { name: '吐纳基础', depth: 0, exp: 0, main: true },
    { name: '七式快剑', depth: 1, exp: 60, main: false },
  ]) };
  check('术法小成解锁 pierce', Math.abs(techniques.learnedArts(fighter2, 'spell')[0].effect.pierce - 0.1) < 1e-9);

  // 切磋：术法加成提高胜率（统计）
  const swordsman = fakeChar({
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true },
      { name: '万剑归宗', depth: 0, exp: 0, main: false },
    ]),
  });
  let wSword = 0, wPlain = 0;
  for (let i = 0; i < 500; i++) {
    if (duel.resolve(swordsman).renderParams.outcome === 'win') wSword++;
    if (duel.resolve(fakeChar()).renderParams.outcome === 'win') wPlain++;
  }
  check('万剑归宗显著提高胜率', wSword > wPlain + 50, `术法 ${wSword} vs 徒手 ${wPlain}`);

  // 身法提速（统计平均天数）
  const flyer = fakeChar({
    learned_techniques: JSON.stringify([{ name: '鲲鹏游', depth: 0, exp: 0, main: false }]),
  });
  check('身法速度取最高(3.0)', techniques.movementSpeed(flyer).speed === 3.0);
  let dFly = 0, dWalk = 0;
  for (let i = 0; i < 60; i++) {
    dFly += travel.resolve(flyer, { destination: '云来城' }).elapsedDays;
    dWalk += travel.resolve(fakeChar(), { destination: '云来城' }).elapsedDays;
  }
  check('鲲鹏游明显缩短旅程', dFly * 2 < dWalk, `身法 ${dFly} vs 步行 ${dWalk}`);

  // 施展秘术：敛息术
  const caster = fakeChar({
    qi_current: 100,
    learned_techniques: JSON.stringify([{ name: '敛息术', depth: 0, exp: 0, main: false }]),
  });
  const castOut = secret.resolve(caster, { name: '敛息术' });
  check('敛息术设置战力增益', castOut.sets && JSON.parse(castOut.sets.power_buff).pct === 0.15);
  check('敛息术消耗 30% 灵力', castOut.deltas.qi_current === -30, JSON.stringify(castOut.deltas));
  check('秘术施展 +10 经验', JSON.parse(castOut.sets.learned_techniques)[0].exp === 10);

  // 血遁术遁走
  const fleer = fakeChar({
    discovered_locations: JSON.stringify(['云来城', '太虚剑宗']),
    learned_techniques: JSON.stringify([{ name: '血遁术', depth: 0, exp: 0, main: false }]),
  });
  const fleeOut = secret.resolve(fleer, { name: '血遁术' });
  check('血遁术转移位置', fleeOut.sets && /^中州-(云来城|无名小镇)$/.test(fleeOut.sets.current_location), fleeOut.sets && fleeOut.sets.current_location);
  check('血遁术生命代价', fleeOut.deltas.health === -20);

  // 诡术：异化门槛与异化加深
  const lowCorr = fakeChar({
    strange_corruption: 10,
    learned_techniques: JSON.stringify([{ name: '噬影法', depth: 0, exp: 0, main: false }]),
  });
  check('诡术异化不足被拒', secret.resolve(lowCorr, { name: '噬影法' }).renderParams.outcome === 'corruption_low');
  const corrCaster = fakeChar({
    strange_corruption: 25, health: 50,
    learned_techniques: JSON.stringify([{ name: '噬影法', depth: 0, exp: 0, main: false }]),
  });
  const corrOut = secret.resolve(corrCaster, { name: '噬影法' });
  check('噬影法回血+异化', corrOut.deltas.health === 30 && corrOut.sets.strange_corruption === 30,
    JSON.stringify({ d: corrOut.deltas, s: corrOut.sets }));

  // 入宗加授杂学（太虚剑宗：太虚引气术 + 御剑术）
  const joinChar2 = fakeChar({
    spirit_roots: JSON.stringify({ 金: 90 }), comprehension: 90, qi_max: 200,
    current_location: '中州-太虚剑宗',
  });
  let joined2 = null;
  for (let i = 0; i < 50 && !joined2; i++) {
    const out = sectJoin.resolve(joinChar2);
    if (out.renderParams && out.renderParams.success) joined2 = out;
  }
  const joinList = joined2 ? JSON.parse(joined2.sets.learned_techniques) : [];
  check('入宗加授御剑术', joinList.some(e => e.name === '御剑术'), JSON.stringify(joinList.map(e => e.name)));

  // 探索残卷（7%，跑 300 次必见）
  let scrollSeen = null;
  for (let i = 0; i < 300 && !scrollSeen; i++) {
    const out = explore.resolve(fakeChar());
    if (out.renderParams && out.renderParams.outcome === 'technique_scroll') scrollSeen = out;
  }
  check('探索可发现功法残卷', !!scrollSeen);
  if (scrollSeen) check('残卷带升级收益', (scrollSeen.extraRewards || []).some(r => r.text.includes('习得')));

  // 坊市残页（灵石充足，跑 100 次）
  const rich = fakeChar({ spirit_stones: 999999 });
  let scrollBuy = null;
  for (let i = 0; i < 100 && !scrollBuy; i++) {
    const out = trade.resolve(rich, { mode: 'buy' });
    if (out.renderParams && out.renderParams.outcome === 'bought_scroll') scrollBuy = out;
  }
  check('坊市可购功法残页', !!scrollBuy);
}

// ---------- 15. 邪修路线闭环 ----------
console.log('\n[15] 邪修路线');
{
  const strange = require('./src/xianxia/scripts/strange_contact');
  const trade = require('./src/xianxia/scripts/trade');
  require('./src/xianxia/world').seedAll();

  // 白骨观入门：地点含宗门名 → 拜白骨观；清白之身歃血为誓
  const evilJoinChar = fakeChar({
    spirit_roots: JSON.stringify({ 金: 90 }), comprehension: 90, qi_max: 200,
    current_location: '西漠-白骨观', infamy: 0,
  });
  let evilJoined = null;
  for (let i = 0; i < 50 && !evilJoined; i++) {
    const out = sectJoin.resolve(evilJoinChar);
    if (out.renderParams && out.renderParams.success) evilJoined = out;
  }
  check('拜入白骨观成功', !!evilJoined && evilJoined.renderParams.sect === '白骨观');
  if (evilJoined) {
    const list = JSON.parse(evilJoined.sets.learned_techniques);
    check('授予白骨心法', list.some(e => e.name === '白骨心法'), JSON.stringify(list.map(e => e.name)));
    check('歃血为誓 生命-15', evilJoined.deltas.health === -15, JSON.stringify(evilJoined.deltas));
    check('歃血为誓 恶名+15', evilJoined.deltas.infamy === 15, JSON.stringify(evilJoined.deltas));
    check('renderParams 带 evil/bloodOath', evilJoined.renderParams.evil === true && evilJoined.renderParams.bloodOath === true);
  }

  // 浑天宗入门：站在浑天宗山门前拜浑天宗而非区域默认
  const huntianChar = fakeChar({
    spirit_roots: JSON.stringify({ 金: 90 }), comprehension: 90, qi_max: 200,
    current_location: '中州-浑天宗',
  });
  let huntianJoined = null;
  for (let i = 0; i < 50 && !huntianJoined; i++) {
    const out = sectJoin.resolve(huntianChar);
    if (out.renderParams && out.renderParams.success) huntianJoined = out;
  }
  check('拜入浑天宗成功', !!huntianJoined && huntianJoined.renderParams.sect === '浑天宗');
  if (huntianJoined) {
    const list = JSON.parse(huntianJoined.sets.learned_techniques);
    check('授予浑天引', list.some(e => e.name === '浑天引'), JSON.stringify(list.map(e => e.name)));
  }

  // 固定 NPC 补种：万毒教掌门存在
  const wanduNpc = db.prepare("SELECT id FROM xianxia_npcs WHERE name = '万毒老母' AND is_fixed = 1").get();
  check('万毒老母已补种', !!wanduNpc);

  // 诡术授予链：虚海高异化者一次接触习得虚海心经 + 噬影法
  const corrChar = fakeChar({
    current_location: '东海-虚海', strange_corruption: 45,
    learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, main: true }]),
  });
  const corrOut = strange.resolve(corrChar);
  const corrList = corrOut.sets && corrOut.sets.learned_techniques ? JSON.parse(corrOut.sets.learned_techniques) : [];
  check('虚海接触习得虚海心经', corrList.some(e => e.name === '虚海心经'), JSON.stringify(corrList.map(e => e.name)));
  check('虚海接触习得噬影法', corrList.some(e => e.name === '噬影法'), JSON.stringify(corrList.map(e => e.name)));

  // onlyEvil 抽取：必出邪修功法（邪修术法多为宝品需筑基期，用筑基角色抽取）
  const foundationChar = fakeChar({ cultivation_paths: JSON.stringify({ xiandao: '筑基初期' }) });
  const evilArt = techniques.randomUnlearnedArt(foundationChar, { onlyEvil: true });
  check('onlyEvil 抽出邪修功法', !!evilArt && !!(evilArt.req && evilArt.req.evil), evilArt && evilArt.name);

  // 黑水港黑市残页：循环 buy 至出现 bought_scroll
  const blackMarketChar = fakeChar({ spirit_stones: 999999, current_location: '东海-黑水港' });
  let blackScroll = null;
  for (let i = 0; i < 200 && !blackScroll; i++) {
    const out = trade.resolve(blackMarketChar, { mode: 'buy' });
    if (out.renderParams && out.renderParams.outcome === 'bought_scroll') {
      blackScroll = out;
      // 已习得则写回，避免下次抽到同一部
      if (out.sets && out.sets.learned_techniques) blackMarketChar.learned_techniques = out.sets.learned_techniques;
    }
  }
  check('黑水港可购功法残页', !!blackScroll);
}

// ---------- 16. 身体状态伤病闭环 ----------
console.log('\n[16] 身体状态伤病');
{
  const rest = require('./src/xianxia/scripts/rest_recover');
  const { SERIOUS_INJURY_PATTERN, RECOVERABLE_INJURY_PATTERN } = require('./src/xianxia/scripts/utils');

  // 经脉受损（大突破部分成功）可被静养≥3天治愈
  const damaged = fakeChar({ body_status: '经脉受损，一月内不可动用全力' });
  const restOut = rest.resolve(damaged, { days: 3 }, '静养三天');
  check('经脉受损静养3天痊愈', restOut.sets && restOut.sets.body_status === '恢复康健',
    JSON.stringify(restOut.sets));

  // 静养不足3天不愈
  const shortRest = rest.resolve(damaged, { days: 2 }, '休整两天');
  check('静养2天不足以致愈', !shortRest.sets || shortRest.sets.body_status !== '恢复康健');

  // 经脉受损 → 修炼效率减半
  const cultBase = cultivation.resolve(fakeChar(), { days: 10 });
  const cultHurt = cultivation.resolve(damaged, { days: 10 });
  check('经脉受损修炼减半', cultHurt.deltas.qi_current < cultBase.deltas.qi_current * 0.6,
    `基础 ${cultBase.deltas.qi_current} vs 受损 ${cultHurt.deltas.qi_current}`);

  // 关键词表覆盖所有突破写入的伤病文案
  const writtenStatuses = [
    '轻微损耗，需要静养数日', '经脉受损，一月内不可动用全力',
    '经脉受创：修炼效率减半，静养数日可愈', '重伤：经脉寸断般剧痛，需静养多日方可恢复',
    '走火入魔：道心受损，神识涣散，修炼效率大减，需静养良久',
    '气血翻涌：数日之内突破成功率降低，需静养平复',
  ];
  check('全部突破伤病可被静养治愈', writtenStatuses.every(s => RECOVERABLE_INJURY_PATTERN.test(s)));
  check('重伤级全部触发修炼减半',
    ['经脉受损，一月内不可动用全力', '经脉受创：修炼效率减半，静养数日可愈',
     '重伤：经脉寸断般剧痛，需静养多日方可恢复', '走火入魔：道心受损，神识涣散，修炼效率大减，需静养良久']
      .every(s => SERIOUS_INJURY_PATTERN.test(s)));
  check('轻微损耗/气血翻涌不触发减半',
    !SERIOUS_INJURY_PATTERN.test('轻微损耗，需要静养数日') && !SERIOUS_INJURY_PATTERN.test('气血翻涌：数日之内突破成功率降低，需静养平复'));
}

// ---------- 17. 按类型主修 + 触类旁通经验 ----------
console.log('\n[17] 按类型主修与批量经验');
{
  // 学习第一部术法：自动成为术法主修，不抢心法主修
  const char17 = fakeChar({
    learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, exp: 0, main: true }]),
  });
  const l1 = techniques.learnTechnique(char17, '七式快剑', { makeMain: undefined });
  check('首部术法自动成为术法主修', l1.learned === true && l1.becameMain === true);
  const char17b = { ...char17, learned_techniques: JSON.stringify(l1.list) };
  check('心法主修不受影响', techniques.getMainTechnique(char17b).name === '吐纳基础');
  check('getMainOfType(spell)=七式快剑', techniques.getMainOfType(char17b, 'spell').name === '七式快剑');

  // 转修术法：只清术法类型的 main
  const l2 = techniques.learnTechnique(char17b, '火弹术', {});
  const char17c = { ...char17b, learned_techniques: JSON.stringify(l2.list) };
  const swS = techniques.switchMainTechnique(char17c, '火弹术');
  check('术法可转修', swS.switched === true && swS.type === 'spell');
  const mains = swS.list.filter(e => e.main).map(e => e.name).sort();
  check('每类型各一个主修', JSON.stringify(mains) === JSON.stringify(['吐纳基础', '火弹术'].sort()), JSON.stringify(mains));

  // 修炼触类旁通：主修心法全额，其余功法三成
  const cultChar = fakeChar({
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true },
      { name: '七式快剑', depth: 0, exp: 0, main: true },
    ]),
  });
  const cultOut = cultivation.resolve(cultChar, { days: 30 });
  const cultList = JSON.parse(cultOut.sets.learned_techniques);
  const heartExp = cultList.find(e => e.name === '吐纳基础').exp;
  const spellExp = cultList.find(e => e.name === '七式快剑').exp;
  check('修炼后主修心法获得经验', heartExp > 0, `heartExp=${heartExp}`);
  check('修炼后术法也获得经验（约三成）', spellExp > 0 && spellExp < heartExp, `spellExp=${spellExp} heartExp=${heartExp}`);
  check('术法经验≈主修三成', Math.abs(spellExp / heartExp - 0.3) < 0.1, `比值 ${(spellExp / heartExp).toFixed(2)}`);

  // 赶路砺身法
  const travel = require('./src/xianxia/scripts/travel');
  const travChar = fakeChar({
    current_location: '中州-无名小镇',
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true },
      { name: '御风术', depth: 0, exp: 0, main: true },
    ]),
  });
  const travOut = travel.resolve(travChar, { destination: null });
  const travList = travOut.sets && travOut.sets.learned_techniques ? JSON.parse(travOut.sets.learned_techniques) : [];
  const moveExp = (travList.find(e => e.name === '御风术') || {}).exp || 0;
  const heartExpT = (travList.find(e => e.name === '吐纳基础') || { exp: 0 }).exp || 0;
  check('赶路后身法获得经验', moveExp > 0, `moveExp=${moveExp}`);
  check('赶路不增加心法经验', heartExpT === 0, `heartExp=${heartExpT}`);
}

// ---------- 18. 精气神成长体系 ----------
console.log('\n[18] 精气神成长');
let pillTestDone = Promise.resolve();
{
  // 凡品功法默认三元（吐纳基础 凡品：perBreak 2，cap 30）
  const tg = techniques.breakthroughStatGains(fakeChar({
    learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, exp: 0, main: true }]),
  }));
  check('凡品功法默认三元 各+2', tg.gains && tg.gains.essence === 2 && tg.gains.qi === 2 && tg.gains.spirit === 2,
    JSON.stringify(tg.gains));

  // 总量取单功法最大值：吐纳基础 + 七式快剑（均凡品）→ 各 +2（不再叠加为 +4）
  const tgMulti = techniques.breakthroughStatGains(fakeChar({
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true },
      { name: '七式快剑', depth: 0, exp: 0, main: true },
    ]),
  }));
  check('多部同修不叠加：两部凡品取 max 各 +2', tgMulti.gains && tgMulti.gains.essence === 2 && tgMulti.gains.qi === 2 && tgMulti.gains.spirit === 2,
    JSON.stringify(tgMulti.gains));
  const qjsj = tgMulti.list.find(e => e.name === '七式快剑');
  check('非主修功法各自累计 stat_gained', qjsj && qjsj.stat_gained === 6, JSON.stringify(qjsj));

  // 品级取高：凡品(+2) + 圣品归元天书(精默认10/气12/神12) → 精+10 气+12 神+12，而非加总
  const tgMax = techniques.breakthroughStatGains(fakeChar({
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true },
      { name: '归元天书', depth: 0, exp: 0, main: false },
    ]),
  }));
  check('凡品+圣品取 max（精+10 气+12 神+12）', tgMax.gains && tgMax.gains.essence === 10 && tgMax.gains.qi === 12 && tgMax.gains.spirit === 12,
    JSON.stringify(tgMax.gains));

  // 诡品负值代价与正收益并存：吐纳基础 +2 与虚海心经 -8 → 精 -6，气/神仍 +2
  const tgMix = techniques.breakthroughStatGains(fakeChar({
    strange_corruption: 50,
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true },
      { name: '虚海心经', depth: 0, exp: 0, main: false },
    ]),
  }));
  check('诡品代价与正收益并存（精-6 气+2 神+2）', tgMix.gains && tgMix.gains.essence === -6 && tgMix.gains.qi === 2 && tgMix.gains.spirit === 2,
    JSON.stringify(tgMix.gains));

  // 上限削减：stat_gained=28 时只剩 2 点额度
  const tg2 = techniques.breakthroughStatGains(fakeChar({
    learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, exp: 0, main: true, stat_gained: 28 }]),
  }));
  check('上限削减：仅剩 essence +2', tg2.gains && tg2.gains.essence === 2 && !tg2.gains.qi && !tg2.gains.spirit && tg2.capped,
    JSON.stringify(tg2));
  check('stat_gained 累计到 30', (tg2.list.find(e => e.name === '吐纳基础') || {}).stat_gained === 30);

  // 达到上限后不再给加成
  const tg3 = techniques.breakthroughStatGains(fakeChar({
    learned_techniques: JSON.stringify([{ name: '吐纳基础', depth: 0, exp: 0, main: true, stat_gained: 30 }]),
  }));
  check('达到上限后 gains=null', tg3.gains === null);

  // 诡品：显式负值代价，不占上限
  const tg4 = techniques.breakthroughStatGains(fakeChar({
    strange_corruption: 50,
    learned_techniques: JSON.stringify([{ name: '虚海心经', depth: 0, exp: 0, main: true }]),
  }));
  check('诡品负值代价 精-8', tg4.gains && tg4.gains.essence === -8, JSON.stringify(tg4.gains));
  check('诡品不累计 stat_gained', !((tg4.list.find(e => e.name === '虚海心经') || {}).stat_gained > 0));

  // enrichForClient 透出三元额度（凡品 cap 30；诡品 cap 为 null）
  const enriched = techniques.enrichForClient(fakeChar({
    learned_techniques: JSON.stringify([
      { name: '吐纳基础', depth: 0, exp: 0, main: true, stat_gained: 6 },
      { name: '虚海心经', depth: 0, exp: 0, main: false },
    ]),
  }));
  const enTn = enriched.find(e => e.name === '吐纳基础');
  const enXh = enriched.find(e => e.name === '虚海心经');
  check('enrichForClient 返回 stat_gained/stat_cap', enTn && enTn.stat_gained === 6 && enTn.stat_cap === 30,
    JSON.stringify(enTn && { stat_gained: enTn.stat_gained, stat_cap: enTn.stat_cap }));
  check('诡品 stat_cap 为 null', enXh && enXh.stat_cap === null);

  // 小境界突破：精气神各 +当前大境界层级（炼气 +1）
  const att = require('./src/xianxia/scripts/breakthrough_attempt');
  let smallGain = null;
  for (let i = 0; i < 50 && !smallGain; i++) {
    const out = att.resolve(fakeChar({ qi_current: 100, qi_max: 100, dao_heart: 100, essence: 80, qi: 80, spirit: 80 }));
    if (out.renderParams && out.renderParams.outcome === 'small_success') smallGain = out;
  }
  check('小境界突破成功', !!smallGain);
  if (smallGain) {
    check('小突破精气神各 +1', smallGain.deltas.essence === 1 && smallGain.deltas.qi === 1 && smallGain.deltas.spirit === 1,
      JSON.stringify(smallGain.deltas));
  }

  // 日常涓流：修满 30 天各 +1；29 天没有
  const tr30 = cultivation.resolve(fakeChar(), { days: 30 });
  check('修炼30天 涓流各+1', tr30.deltas.essence === 1 && tr30.deltas.qi === 1 && tr30.deltas.spirit === 1,
    JSON.stringify(tr30.deltas));
  const tr29 = cultivation.resolve(fakeChar(), { days: 29 });
  check('修炼29天 无涓流', tr29.deltas.essence === undefined, JSON.stringify(tr29.deltas));

  // 永久三元丹：每种限服 3 次（真实落库；useItem 函数体为同步执行，调用后可直接读 res）
  pillTestDone = (async () => {
    const xianxia = require('./src/xianxia/index');
    const email = `pill_test_${Date.now()}@example.com`;
    const user = db.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)')
      .run(email, 'x', '丹药测试');
    const char = db.prepare(
      'INSERT INTO xianxia_characters (user_id, name, gender, spirit_roots, special_body, birth_region, birth_background, learned_techniques) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(user.lastInsertRowid, '试丹人', 'male', '{}', null, '中州', '猎户', '[]');
    const charId = char.lastInsertRowid;
    const mkRes = () => ({ status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
    try {
      const results = [];
      for (let i = 0; i < 4; i++) {
        const item = db.prepare(
          "INSERT INTO xianxia_items (character_id, name, item_type, grade, effect, quantity) VALUES (?, '洗髓丹', 'pill', '玄品', ?, 1)"
        ).run(charId, JSON.stringify({ essence: 10 }));
        const res = mkRes();
        xianxia.useItem({ params: { id: charId }, userId: user.lastInsertRowid, body: { itemId: item.lastInsertRowid } }, res);
        results.push(res);
      }
      const okCount = results.filter(r => r.body && r.body.deltas && r.body.deltas.essence === 10).length;
      check('前三次服丹 精+10 生效', okCount === 3, `生效 ${okCount} 次`);
      check('第四次服丹被拒', results[3].code === 400, `code=${results[3].code}`);
      const finalChar = db.prepare('SELECT essence FROM xianxia_characters WHERE id = ?').get(charId);
      check('精永久 +30', finalChar.essence === 70, `实际 ${finalChar.essence}`);
    } finally {
      db.prepare('DELETE FROM xianxia_characters WHERE id = ?').run(charId);
      db.prepare('DELETE FROM users WHERE id = ?').run(user.lastInsertRowid);
    }
  })();
}

// ---------- 19. 纪元大事记 ----------
console.log('\n[19] 纪元大事记');
{
  const chronicle = require('./src/xianxia/chronicle');
  const world = require('./src/xianxia/world');

  // 纯生成器：连发 60 次均有标题与正文，且状态改写合法
  const simState = JSON.parse(JSON.stringify(world.DEFAULT_WORLD_STATE));
  let genOk = true;
  for (let i = 0; i < 60; i++) {
    const e = chronicle.generateYearEvent(simState, i + 2);
    if (!e || !e.title || !e.text || e.year !== i + 2) genOk = false;
  }
  check('生成器 60 连发均有标题与正文', genOk);
  const tensionsOk = Object.values(simState.faction_relations).every(r => r.tension >= 0 && r.tension <= 100);
  check('势力张力钳制在 0-100', tensionsOk);
  const realmsOk = Object.values(simState.secret_realms).every(r => r.status === 'active' || r.status === 'dormant');
  check('秘境状态合法', realmsOk);
  check('纪元年份推导（16 岁=第1年）', chronicle.gameYearOf({ game_age: 16 }) === 1 && chronicle.gameYearOf({ game_age: 22.9 }) === 7);

  // 推进流程（真实落库；世界表相关键先备份、跑完恢复）
  const KEYS = ['chronicle', 'chronicle_year', 'faction_relations', 'secret_realms'];
  const backup = {};
  for (const k of KEYS) {
    const row = db.prepare('SELECT value FROM xianxia_world_state WHERE key = ?').get(k);
    backup[k] = row ? row.value : null;
  }
  db.prepare("DELETE FROM xianxia_world_state WHERE key IN ('chronicle', 'chronicle_year')").run();

  const email = `chron_test_${Date.now()}@example.com`;
  const user = db.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)').run(email, 'x', '大事记测试');
  const char = db.prepare(
    'INSERT INTO xianxia_characters (user_id, name, gender, spirit_roots, special_body, birth_region, birth_background, learned_techniques, game_age) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(user.lastInsertRowid, '纪年人', 'male', '{}', null, '中州', '猎户', '[]', 16);
  const charId = char.lastInsertRowid;
  try {
    // 首次启用：快进到当前年，不补生成陈年旧事
    const first = chronicle.advanceChronicle(charId, '16岁');
    check('首次启用快进且无补记', first.length === 0);
    const y1 = db.prepare("SELECT value FROM xianxia_world_state WHERE key = 'chronicle_year'").get();
    check('chronicle_year 落库为 1', y1 && JSON.parse(y1.value) === 1, JSON.stringify(y1));

    // 推进到第 7 年（22 岁）：覆盖年份 2-7，逢 5 必有一条
    db.prepare('UPDATE xianxia_characters SET game_age = 22 WHERE id = ?').run(charId);
    const entries = chronicle.advanceChronicle(charId, '22岁');
    check('推进至第7年 至少一条大事（逢五必有）', entries.length >= 1, `实际 ${entries.length}`);
    check('单次补记不超过 5 条', entries.length <= 5, `实际 ${entries.length}`);
    const cy = db.prepare("SELECT value FROM xianxia_world_state WHERE key = 'chronicle_year'").get();
    check('chronicle_year 推进到 7', cy && JSON.parse(cy.value) === 7, JSON.stringify(cy));
    const ch = db.prepare("SELECT value FROM xianxia_world_state WHERE key = 'chronicle'").get();
    const chArr = ch ? JSON.parse(ch.value) : null;
    check('chronicle 数组已持久化', Array.isArray(chArr) && chArr.length === entries.length, JSON.stringify(chArr));
    const tl = db.prepare("SELECT COUNT(*) AS c FROM xianxia_timeline WHERE character_id = ? AND event_type = 'world_event'").get(charId);
    check('大事写入角色时间线', tl.c === entries.length, `实际 ${tl.c}`);

    // 同年重复调用不再生成
    const again = chronicle.advanceChronicle(charId, '22岁');
    check('同年重复调用不重复生成', again.length === 0);
  } finally {
    db.prepare('DELETE FROM xianxia_characters WHERE id = ?').run(charId);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.lastInsertRowid);
    for (const k of KEYS) {
      if (backup[k] == null) db.prepare('DELETE FROM xianxia_world_state WHERE key = ?').run(k);
      else db.prepare('INSERT OR REPLACE INTO xianxia_world_state (key, value) VALUES (?, ?)').run(k, backup[k]);
    }
  }
}

pillTestDone.catch(e => { console.error('丹药测试异常:', e && e.message); });
// IIFE 主体同步执行完毕，此处 pass/fail 已是最终值
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);