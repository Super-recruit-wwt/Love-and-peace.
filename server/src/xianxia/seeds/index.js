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
  const existing = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND item_type = 'technique'").get();
  if (existing.c > 0) return;

  const techniques = loadSeedFile('techniques.json');
  const insert = db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, effect, craft_skill, craft_materials, req_essence, req_qi, req_spirit, metadata)
     VALUES (NULL, ?, 'technique', ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
  );

  for (const t of techniques) {
    const req = t.req || {};
    insert.run(
      t.name,
      t.grade,
      t.acquire || '',
      t.effect ? JSON.stringify(t.effect) : null,
      req.essence || null,
      req.qi || null,
      req.spirit || null,
      JSON.stringify({ type: t.type, faction: t.faction || null })
    );
  }
  console.log(`[seeds] ✓ 播种 ${techniques.length} 部功法`);
}

function seedPills() {
  const existing = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id IS NULL AND item_type = 'pill'").get();
  if (existing.c > 0) return;

  const pills = loadSeedFile('pills.json');
  const insert = db.prepare(
    `INSERT INTO xianxia_items (character_id, name, item_type, grade, description, effect, craft_skill, craft_materials, metadata)
     VALUES (NULL, ?, 'pill', ?, ?, ?, ?, ?, ?)`
  );

  for (const p of pills) {
    insert.run(
      p.name,
      p.grade,
      p.note || '',
      p.effect ? JSON.stringify(p.effect) : null,
      p.skill || null,
      p.materials ? JSON.stringify(p.materials) : null,
      JSON.stringify({ side_effect: p.side_effect || null, limit: p.limit || null, buy_price: p.buy_price || null })
    );
  }
  console.log(`[seeds] ✓ 播种 ${pills.length} 种丹药`);
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
