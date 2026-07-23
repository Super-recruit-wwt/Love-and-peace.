// 种子数据加载器 — 服务端启动时将功法/丹药/符箓/材料模板写入 xianxia_items
const { db } = require('../../db');
const fs = require('fs');
const path = require('path');

function loadSeedFile(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[seeds] 种子文件不存在: ${filename}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function seedTechniques() {
  const techniques = loadSeedFile('techniques.json');

  const insert = db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, effect, craft_skill, craft_materials, req_essence, req_qi, req_spirit, metadata)
     VALUES (NULL, ?, 'technique', ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
  );
  // 已存在的同名模板按种子文件刷新（保证 req/effect 等字段修正能下发到旧库）
  const update = db.prepare(
    `UPDATE xianxia_items SET grade = ?, description = ?, effect = ?, req_essence = ?, req_qi = ?, req_spirit = ?, metadata = ?
     WHERE character_id IS NULL AND item_type = 'technique' AND name = ?`
  );

  let inserted = 0, updated = 0;
  for (const t of techniques) {
    const req = t.req || {};
    // 完整 req 入 metadata（cultivation/roots/evil/faction/sword/corruption 等），三元门槛同步到专用列
    // stat_bias：功法三元滋养的偏向属性（essence/qi/spirit，诡品无）
    const metadata = JSON.stringify({ type: t.type, faction: t.faction || null, req, stat_bias: t.stat_bias || null });
    const params = [
      t.grade,
      t.acquire || '',
      t.effect ? JSON.stringify(t.effect) : null,
      req.essence || null,
      req.qi || null,
      req.spirit || null,
      metadata,
    ];
    const exists = db.prepare(
      "SELECT id FROM xianxia_items WHERE character_id IS NULL AND item_type = 'technique' AND name = ?"
    ).get(t.name);
    if (exists) {
      update.run(...params, t.name);
      updated++;
    } else {
      insert.run(t.name, ...params);
      inserted++;
    }
  }
  // 功法模板缓存失效（techniques 模块按 name 缓存了模板）
  try { require('../techniques').invalidateTemplateCache(); } catch {}
  console.log(`[seeds] ✓ 功法模板同步：新增 ${inserted} 部，刷新 ${updated} 部`);
}

function seedPills() {
  const pills = loadSeedFile('pills.json');
  // 按 (name, grade) upsert：新丹方补种、旧丹方刷新（同名不同品级视为不同丹药）
  const insert = db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, effect, craft_skill, craft_materials, metadata)
     VALUES (NULL, ?, 'pill', ?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE xianxia_items SET description = ?, effect = ?, craft_skill = ?, craft_materials = ?, metadata = ?
     WHERE character_id IS NULL AND item_type = 'pill' AND name = ? AND grade = ?`
  );

  let inserted = 0, updated = 0;
  for (const p of pills) {
    const params = [
      p.note || '',
      p.effect ? JSON.stringify(p.effect) : null,
      p.skill || null,
      p.materials ? JSON.stringify(p.materials) : null,
      JSON.stringify({ side_effect: p.side_effect || null, limit: p.limit || null, buy_price: p.buy_price || null }),
    ];
    const exists = db.prepare(
      "SELECT id FROM xianxia_items WHERE character_id IS NULL AND item_type = 'pill' AND name = ? AND grade = ?"
    ).get(p.name, p.grade);
    if (exists) {
      update.run(...params, p.name, p.grade);
      updated++;
    } else {
      insert.run(p.name, p.grade, ...params);
      inserted++;
    }
  }
  console.log(`[seeds] ✓ 丹药模板同步：新增 ${inserted} 种，刷新 ${updated} 种`);
}

function seedTalismans() {
  const existing = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND item_type = 'talisman'").get();
  if (existing.c > 0) return;

  const talismans = loadSeedFile('talismans.json');
  const insert = db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, effect, craft_skill, craft_materials, metadata)
     VALUES (NULL, ?, 'talisman', ?, ?, ?, ?, ?, ?)`
  );

  for (const t of talismans) {
    insert.run(
      t.name,
      t.grade,
      t.note || '',
      t.effect ? JSON.stringify(t.effect) : null,
      t.skill || null,
      t.materials ? JSON.stringify(t.materials) : null,
      JSON.stringify({ type: t.type, buy_price: t.buy_price || null })
    );
  }
  console.log(`[seeds] ✓ 播种 ${talismans.length} 种符箓`);
}

function seedMaterials() {
  const existing = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND item_type = 'material'").get();
  if (existing.c > 0) return;

  const materials = loadSeedFile('materials.json');
  const insert = db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, raw_effect, raw_side_effect, metadata)
     VALUES (NULL, ?, 'material', ?, ?, ?, ?, ?)`
  );

  for (const m of materials) {
    insert.run(
      m.name,
      m.grade,
      (m.raw_effect && m.raw_effect.note) || '',
      m.raw_effect ? JSON.stringify(m.raw_effect) : null,
      m.raw_side_effect ? JSON.stringify(m.raw_side_effect) : null,
      JSON.stringify({ region: m.region, gather: m.gather, buy_price: m.buy_price, sell_price: m.sell_price, craft_use: m.craft_use })
    );
  }
  console.log(`[seeds] ✓ 播种 ${materials.length} 种材料`);
}

// 特殊装备模板：以 artifact + slot='special' 入库（effect 存规则 JSON，special_id 供剧本识别）
function seedSpecialEquipment() {
  const existing = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND slot = 'special'").get();
  if (existing.c > 0) return;

  const specials = loadSeedFile('special_equipment.json');
  const insert = db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, slot, effect, metadata)
     VALUES (NULL, ?, 'artifact', '宝品', ?, 'special', ?, ?)`
  );

  for (const s of specials) {
    insert.run(
      s.name,
      s.description || '',
      s.effect ? JSON.stringify(s.effect) : null,
      JSON.stringify({ special_id: s.id, cost: s.cost || null, acquire: s.acquire || null })
    );
  }
  console.log(`[seeds] ✓ 播种 ${specials.length} 件特殊装备`);
}

function seedAll() {
  seedTechniques();
  seedPills();
  seedTalismans();
  seedMaterials();
  seedSpecialEquipment();
}

module.exports = { seedAll };
