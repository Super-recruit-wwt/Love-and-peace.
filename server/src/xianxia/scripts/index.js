// 剧本注册表 + 意图匹配器（纯规则，不调 LLM）
// 按优先级排序：具体意图在前，泛化意图在后

const scripts = [
  require('./breakthrough_attempt'),
  require('./strange_ponder'),
  require('./strange_contact'),
  require('./strange_use_power'),
  require('./alchemy_craft'),
  require('./sect_join'),
  require('./technique_switch'),
  require('./technique_ponder'),
  require('./technique_mentor'),
  require('./technique_secret'),
  require('./challenge_duel'),
  require('./fortune_event'),
  require('./rest_recover'),
  require('./trade'),
  require('./npc_talk'),
  require('./travel'),
  require('./gather_materials'),
  require('./explore_location'),
  require('./cultivation_routine'),
];

/**
 * 意图匹配：返回 { script, params } 或 null（走 free_narrative 管线）
 */
function matchScript(actionText, character) {
  for (const script of scripts) {
    try {
      const params = script.match(actionText, character);
      if (params) return { script, params };
    } catch (err) {
      console.error(`剧本匹配异常 [${script.id}]:`, err.message);
    }
  }
  return null;
}

module.exports = { scripts, matchScript };
