// 传讯玉符测试：由 test-techniques.js 末尾挂载执行（check 共享计数）
// 测试强制走 LLM 兜底路径（清除 LLM_API_KEY），验证无 key 时的完整流程
const { db } = require('./src/db');
const jade = require('./src/xianxia/jade');
const npcEngine = require('./src/xianxia/npc');

async function run(check) {
  console.log('\n[23] 传讯玉符');

  // 强制 LLM 兜底：无论 .env 是否配置 key，本段测试都不发真实请求
  const savedKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;

  const email = `jade_test_${Date.now()}@example.com`;
  const user = db.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)')
    .run(email, 'x', '玉符测试');
  const uid = user.lastInsertRowid;
  const char = db.prepare(
    "INSERT INTO xianxia_characters (user_id, name, gender, spirit_roots, birth_region, birth_background, learned_techniques, game_age) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(uid, '玉符客', 'male', '{}', '中州', '猎户', '[]', 16);
  const charId = char.lastInsertRowid;
  // 测试专用 NPC（不依赖种子数据）
  const npcRes = db.prepare(
    "INSERT INTO xianxia_npcs (name, identity, faction, location, personality_type, personality_traits, is_fixed, is_alive) VALUES (?, ?, ?, ?, ?, ?, 0, 1)"
  ).run('玉符测试散人', '散修', '云来城', '中州-云来城', '温和', '{}');
  const npcId = npcRes.lastInsertRowid;

  try {
    // 建立朋友关系（具备赠礼资格）
    npcEngine.getOrCreateRelation(charId, npcId);
    db.prepare('UPDATE xianxia_relationships SET relation_types = ? WHERE character_id = ? AND npc_id = ?')
      .run(JSON.stringify(['friend']), charId, npcId);

    // ---- sendPlayerMessage：兜底回复 + 双消息入库 + 会话时间更新 ----
    const sendRes = await jade.sendPlayerMessage(charId, npcId, '道友近来可好？');
    check('发送后收到 NPC 兜底回复', !!(sendRes && sendRes.reply && typeof sendRes.reply.content === 'string' && sendRes.reply.content.length > 0));
    const thread = db.prepare('SELECT * FROM xianxia_jade_threads WHERE character_id = ? AND npc_id = ?').get(charId, npcId);
    check('会话已建立', !!thread);
    check('last_message_at 已更新', !!(thread && thread.last_message_at));
    const msgs = db.prepare('SELECT * FROM xianxia_jade_messages WHERE thread_id = ? ORDER BY id').all(thread.id);
    check('玩家+NPC 两条消息入库', msgs.length === 2 && msgs[0].sender === 'player' && msgs[1].sender === 'npc');
    check('玩家消息内容原样保存', msgs[0].content === '道友近来可好？');
    check('在线回复不计未读', thread.unread_player === 0);

    // ---- forceGift 回复：item_payload 结构（强制丹药，保证物品入库断言稳定）----
    const giftSend = await jade.sendPlayerMessage(charId, npcId, '多谢道友挂念。', { forceGift: true, forceType: 'pill' });
    const payload = giftSend.reply.item_payload;
    check('附礼回复带 item_payload', !!(payload && payload.name));
    check('赠品品级在凡/灵/宝之内', !!payload && ['凡品', '灵品', '宝品'].includes(payload.grade));
    check('赠品初始未领取', !!payload && payload.claimed === false);
    check('附礼兜底文案提及所赠之物', giftSend.reply.content.includes(payload.name));

    // ---- claimGift：领取 / 重复领取 / 时间线 ----
    const itemsBefore = db.prepare('SELECT COUNT(*) c FROM xianxia_items WHERE character_id = ?').get(charId).c;
    const claim = jade.claimGift(charId, giftSend.reply.id);
    check('领取成功', claim.ok === true && claim.itemName === payload.name);
    const itemsAfter = db.prepare('SELECT COUNT(*) c FROM xianxia_items WHERE character_id = ?').get(charId).c;
    check('物品入库 +1', itemsAfter === itemsBefore + 1);
    const newItem = db.prepare('SELECT * FROM xianxia_items WHERE character_id = ? ORDER BY id DESC LIMIT 1').get(charId);
    check('入库物品名称/类型/品级一致',
      newItem.name === payload.name && newItem.item_type === payload.item_type && newItem.grade === payload.grade);
    const claim2 = jade.claimGift(charId, giftSend.reply.id);
    check('重复领取返回 400 语义错误', !!claim2.error && claim2.status === 400);
    const claimBad = jade.claimGift(charId, 99999999);
    check('不存在消息返回 404 语义错误', !!claimBad.error && claimBad.status === 404);
    const tl1 = db.prepare("SELECT * FROM xianxia_timeline WHERE character_id = ? AND event_type = 'jade_gift'").all(charId);
    check('领取写入 jade_gift 时间线（含 rewards）',
      tl1.length >= 1 && tl1.some(e => (e.rewards || '').includes('获得')));

    // ---- 功法礼物：领取即学会（写入 learned_techniques），不产生行囊物品 ----
    const techSend = await jade.sendPlayerMessage(charId, npcId, '听闻道友得了一卷功法？', { forceGift: true, forceType: 'technique' });
    const techPayload = techSend.reply.item_payload;
    check('功法礼物类型正确', !!techPayload && techPayload.item_type === 'technique');
    const techItemsBefore = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id = ? AND item_type = 'technique'").get(charId).c;
    const techClaim = jade.claimGift(charId, techSend.reply.id);
    check('功法领取返回 learned', techClaim.ok === true && techClaim.learned === true);
    const learnedRow = db.prepare('SELECT learned_techniques FROM xianxia_characters WHERE id = ?').get(charId);
    const learnedList = JSON.parse(learnedRow.learned_techniques || '[]');
    check('功法写入 learned_techniques', learnedList.some(e => e.name === techPayload.name));
    const techItemsAfter = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id = ? AND item_type = 'technique'").get(charId).c;
    check('功法不产生行囊物品', techItemsAfter === techItemsBefore);

    // ---- 已领取的功法礼物再点一次：修复通道——已学者转为深度经验，并清理错存残留 ----
    db.prepare("INSERT INTO xianxia_items (character_id, name, item_type, grade) VALUES (?, ?, 'technique', '凡品')")
      .run(charId, techPayload.name); // 模拟历史 bug 错存的残留物品
    const repair = jade.claimGift(charId, techSend.reply.id);
    check('修复通道返回 ok + dupExp', repair.ok === true && repair.repaired === true && repair.dupExp > 0);
    const strayLeft = db.prepare("SELECT COUNT(*) c FROM xianxia_items WHERE character_id = ? AND item_type = 'technique' AND name = ?")
      .get(charId, techPayload.name).c;
    check('错存残留已清理', strayLeft === 0);

    // ---- maybeProactiveMessage：force 必中 + 未读 +1 ----
    const pro = await jade.maybeProactiveMessage({ id: charId, status: 'active', game_age: 16 }, { force: true });
    check('主动来讯触发且有内容', pro.triggered === true && typeof pro.content === 'string' && pro.content.length > 0);
    const thread2 = db.prepare('SELECT unread_player FROM xianxia_jade_threads WHERE id = ?').get(thread.id);
    check('主动来讯未读 +1', thread2.unread_player === 1);

    // ---- forceGift 主动来讯：附礼 + 时间线；不附礼不写 ----
    const tlBefore = db.prepare("SELECT COUNT(*) c FROM xianxia_timeline WHERE character_id = ? AND event_type = 'jade_gift'").get(charId).c;
    const proGift = await jade.maybeProactiveMessage({ id: charId, status: 'active', game_age: 16 }, { force: true, forceGift: true });
    check('主动来讯附礼', !!(proGift.triggered && proGift.gift && proGift.gift.name));
    const tlAfter = db.prepare("SELECT COUNT(*) c FROM xianxia_timeline WHERE character_id = ? AND event_type = 'jade_gift'").get(charId).c;
    check('附礼来讯写入时间线', tlAfter === tlBefore + 1);

    // ---- getMessages：正序 + 解析 + 未读清零 ----
    const gm = jade.getMessages(charId, npcId);
    check('getMessages 返回会话与消息', !!(gm && gm.thread && gm.thread.npcName === '玉符测试散人' && gm.messages.length >= 4));
    const ids = gm.messages.map(m => m.id);
    check('消息按 id 正序', ids.every((v, i) => i === 0 || v > ids[i - 1]));
    const withPayload = gm.messages.find(m => m.item_payload);
    check('item_payload 解析为对象', !!(withPayload && typeof withPayload.item_payload === 'object' && withPayload.item_payload.name));
    const thread3 = db.prepare('SELECT unread_player FROM xianxia_jade_threads WHERE id = ?').get(thread.id);
    check('getMessages 后未读清零', thread3.unread_player === 0);

    // ---- listThreads：结构 + 隐藏数值不下发 ----
    const threads = jade.listThreads(charId);
    check('listThreads 返回 1 个会话', threads.length === 1);
    const t0 = threads[0] || {};
    check('会话字段齐全', !!(t0.npcName && t0.lastMessage && Array.isArray(t0.relationTypes) && typeof t0.unreadPlayer === 'number'));
    check('会话不含 affection', !('affection' in t0));

    // ---- 已陨落 NPC 不可发送 ----
    db.prepare('UPDATE xianxia_npcs SET is_alive = 0 WHERE id = ?').run(npcId);
    const deadSend = await jade.sendPlayerMessage(charId, npcId, '还在吗？');
    check('已陨落 NPC 返回 400 语义错误', !!deadSend.error && deadSend.status === 400);
    db.prepare('UPDATE xianxia_npcs SET is_alive = 1 WHERE id = ?').run(npcId);

    // ---- 无关系角色主动来讯安全返回 ----
    const loneUser = db.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)')
      .run(`jade_lone_${Date.now()}@example.com`, 'x', '独处');
    const loneChar = db.prepare(
      "INSERT INTO xianxia_characters (user_id, name, birth_region, birth_background) VALUES (?, '独行人', '中州', '猎户')"
    ).run(loneUser.lastInsertRowid);
    const proNone = await jade.maybeProactiveMessage(
      { id: loneChar.lastInsertRowid, status: 'active', game_age: 16 }, { force: true });
    check('无关系 NPC 时主动来讯安全跳过', proNone.triggered === false);
    db.prepare('DELETE FROM xianxia_characters WHERE id = ?').run(loneChar.lastInsertRowid);
    db.prepare('DELETE FROM users WHERE id = ?').run(loneUser.lastInsertRowid);
  } finally {
    if (savedKey !== undefined) process.env.LLM_API_KEY = savedKey;
    // 清理测试数据
    db.prepare('DELETE FROM xianxia_jade_messages WHERE thread_id IN (SELECT id FROM xianxia_jade_threads WHERE character_id = ?)').run(charId);
    db.prepare('DELETE FROM xianxia_jade_threads WHERE character_id = ?').run(charId);
    db.prepare('DELETE FROM xianxia_timeline WHERE character_id = ?').run(charId);
    db.prepare('DELETE FROM xianxia_relationships WHERE character_id = ?').run(charId);
    db.prepare('DELETE FROM xianxia_items WHERE character_id = ?').run(charId);
    db.prepare('DELETE FROM xianxia_characters WHERE id = ?').run(charId);
    db.prepare('DELETE FROM xianxia_npcs WHERE id = ?').run(npcId);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  }
}

module.exports = { run };
