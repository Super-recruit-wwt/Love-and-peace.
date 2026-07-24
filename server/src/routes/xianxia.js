// 修仙模拟人生 — 服务端路由注册
// 修仙模块已有独立实现（server/src/xianxia/），这里仅负责挂载路由 + 引导初始化

const { authMiddleware } = require('../auth');
const xianxia = require('../xianxia');

function register(app) {
  app.get('/api/xianxia/characters', authMiddleware, xianxia.listCharacters);
  app.post('/api/xianxia/characters', authMiddleware, xianxia.createCharacter);
  app.get('/api/xianxia/characters/:id', authMiddleware, xianxia.getCharacter);
  app.patch('/api/xianxia/characters/:id', authMiddleware, xianxia.updateCharacter);
  app.delete('/api/xianxia/characters/:id', authMiddleware, xianxia.deleteCharacter);
  app.get('/api/xianxia/characters/:id/timeline', authMiddleware, xianxia.getTimeline);
  app.get('/api/xianxia/world-state', authMiddleware, xianxia.getWorldState);
  app.get('/api/xianxia/npcs', authMiddleware, xianxia.listNpcs);
  app.get('/api/xianxia/legacy', authMiddleware, xianxia.getLegacy);
  app.post('/api/xianxia/characters/:id/action', authMiddleware, xianxia.processAction);
  app.post('/api/xianxia/characters/:id/settle', authMiddleware, xianxia.settleTimer);
  app.post('/api/xianxia/characters/:id/birth-narrative', authMiddleware, xianxia.birthNarrative);
  app.get('/api/xianxia/characters/:id/export', authMiddleware, xianxia.exportMD);
  app.post('/api/xianxia/characters/:id/use-item', authMiddleware, xianxia.useItem);
  app.post('/api/xianxia/characters/:id/equip', authMiddleware, xianxia.equipItem);
  app.post('/api/xianxia/characters/:id/unequip', authMiddleware, xianxia.unequipItem);
  app.post('/api/xianxia/characters/:id/technique-main', authMiddleware, xianxia.setTechniqueMain);
  app.get('/api/xianxia/characters/:id/discover-locations', authMiddleware, xianxia.refreshDiscoveredLocations);
  app.post('/api/xianxia/characters/:id/travel', authMiddleware, xianxia.travelTo);
  app.get('/api/xianxia/items/:id/knowledge', authMiddleware, xianxia.getItemKnowledge);
  app.get('/api/xianxia/characters/:id/jade/threads', authMiddleware, xianxia.listJadeThreads);
  app.get('/api/xianxia/characters/:id/jade/threads/:npcId', authMiddleware, xianxia.getJadeMessages);
  app.post('/api/xianxia/characters/:id/jade/send', authMiddleware, xianxia.sendJadeMessage);
  app.post('/api/xianxia/characters/:id/jade/claim', authMiddleware, xianxia.claimJadeGift);

  // 初始化世界状态与固定 NPC（幂等，已有数据则跳过）
  try {
    require('../xianxia/world').seedAll();
    require('../xianxia/seeds').seedAll();
  } catch (err) {
    console.error('修仙世界初始化失败:', err);
  }
}

module.exports = { register };
