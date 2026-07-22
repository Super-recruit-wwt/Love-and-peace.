// 修仙板块本地冒烟测试（临时脚本，测完可删）
// 前提：server 已在 3001 端口运行
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const BASE = 'http://localhost:3001';
const EMAIL = 'smoke@test.local';
const PASS = 'smoke123456';

async function api(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  return cond;
}

(async () => {
  // 1. 直插已验证测试用户
  const db = new Database(path.join(__dirname, 'data', 'love-and-peace.db'));
  const hash = bcrypt.hashSync(PASS, 10);
  db.prepare(
    `INSERT INTO users (email, password_hash, nickname, email_verified) VALUES (?, ?, ?, 1)
     ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, email_verified=1`
  ).run(EMAIL, hash, '冒烟测试员');
  db.close();
  console.log('✅ 测试用户就绪');

  // 2. 登录拿 token
  const login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
  if (!check('登录', login.status === 200 && login.data?.token, `HTTP ${login.status}`)) process.exit(1);
  const token = login.data.token;

  // 3. 世界种子（world.js 接线验证）
  const ws = await api('GET', '/api/xianxia/world-state', null, token);
  check('世界状态已播种（非空）', ws.status === 200 && ws.data && Object.keys(ws.data).length > 0,
    `keys: ${Object.keys(ws.data || {}).length}`);

  const npcs = await api('GET', '/api/xianxia/npcs', null, token);
  const npcList = npcs.data?.npcs || [];
  check('固定 NPC 已入库', npcs.status === 200 && npcList.length > 0, `数量: ${npcList.length}`);
  if (npcList[0]) {
    check('NPC 响应不含隐藏性格数据', !('personality_traits' in npcList[0]));
  }

  // 4. 未授权拦截
  const noauth = await api('GET', '/api/xianxia/characters');
  check('无 token 被 401/403 拦截', noauth.status === 401 || noauth.status === 403, `HTTP ${noauth.status}`);

  // 5. 创建角色
  const created = await api('POST', '/api/xianxia/characters', { name: '测试道人' }, token);
  check('创建角色', created.status === 200 || created.status === 201, `HTTP ${created.status} ${JSON.stringify(created.data)?.slice(0, 200)}`);
  const cid = created.data?.character?.id || created.data?.character_id || created.data?.id;
  if (!cid) { console.log('❌ 无角色 ID，终止'); process.exit(1); }

  // 6. 隐藏数值检查
  const detail = await api('GET', `/api/xianxia/characters/${cid}`, null, token);
  check('角色详情不含 fortune（气运）', detail.status === 200 && !('fortune' in (detail.data?.character || detail.data || {})));
  const rels = (detail.data?.relationships) || [];
  if (rels[0]) check('关系不含好感度数值', !('affection' in rels[0]));

  // 7. PATCH 作弊口（应被拒绝/忽略）
  const cheat = await api('PATCH', `/api/xianxia/characters/${cid}`, { spirit_stones: 999999, status: 'ascended' }, token);
  const after = await api('GET', `/api/xianxia/characters/${cid}`, null, token);
  const ch = after.data?.character || after.data || {};
  check('PATCH 无法改灵石/状态', ch.spirit_stones !== 999999 && ch.status !== 'ascended',
    `spirit_stones=${ch.spirit_stones}, status=${ch.status}`);

  // 8. 出生叙事（真实 LLM 调用）
  const birth = await api('POST', `/api/xianxia/characters/${cid}/birth-narrative`, { stage: 'birth' }, token);
  check('出生叙事生成（LLM）', birth.status === 200 && !!birth.data?.narrative,
    birth.status === 200 ? `叙事长度 ${birth.data.narrative.length} 字` : `HTTP ${birth.status} ${JSON.stringify(birth.data)?.slice(0, 150)}`);

  // 9. 自由行动（真实 LLM 调用 + 时间推进验证）
  const before = await api('GET', `/api/xianxia/characters/${cid}`, null, token);
  const ageBefore = (before.data?.character || before.data)?.game_age;
  const act = await api('POST', `/api/xianxia/characters/${cid}/action`, { action: '我在院子里打坐修炼，感受天地灵气' }, token);
  const actOk = act.status === 200 && !!act.data?.narrative;
  check('自由行动（LLM）', actOk, actOk ? `叙事长度 ${act.data.narrative.length} 字` : `HTTP ${act.status} ${JSON.stringify(act.data)?.slice(0, 150)}`);
  if (actOk) {
    check('叙事文本不含 [TIMER:] 标记残留', !/\[TIMER:/.test(act.data.narrative));
    const afterAct = await api('GET', `/api/xianxia/characters/${cid}`, null, token);
    const ageAfter = (afterAct.data?.character || afterAct.data)?.game_age;
    check('游戏时间推进', ageAfter > ageBefore, `${ageBefore} → ${ageAfter}`);
    if (act.data.timer_end_at) {
      // 触发了倒计时 → 锁定期内再行动应被 423 拦截
      const locked = await api('POST', `/api/xianxia/characters/${cid}/action`, { action: '强行行动' }, token);
      check('倒计时锁定期间行动被 423 拦截', locked.status === 423, `HTTP ${locked.status}`);
    } else {
      console.log('ℹ️ 本次行动未触发倒计时（LLM 未判定耗时活动，正常）');
    }
  }

  // 10. 时间线
  const tl = await api('GET', `/api/xianxia/characters/${cid}/timeline`, null, token);
  check('时间线有记录', tl.status === 200 && Array.isArray(tl.data) && tl.data.length > 0, `条数: ${(tl.data || []).length}`);

  // 11. 频率限制（快速连发 15 次行动，应触发 429）
  let got429 = false;
  for (let i = 0; i < 15; i++) {
    const r = await api('POST', `/api/xianxia/characters/${cid}/action`, { action: `测试${i}` }, token);
    if (r.status === 429) { got429 = true; break; }
    if (r.status === 423) continue; // 被锁不算
  }
  check('频率限制生效（429）', got429);

  console.log('\n冒烟测试完成');
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1); });
