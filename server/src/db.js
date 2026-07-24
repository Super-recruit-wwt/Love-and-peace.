// 数据库入口（兼容层）
// 所有现有 require('./db') 路径保持不变，内部从 db/ 子目录加载
// 新增代码请直接用 require('./db') 引入所需成员

const { db } = require('./db/index');
const { init } = require('./db/schema');
const {
  defaultEmotionalState, getEmotionalState, upsertEmotionalState,
  addCondensedMemory, getCondensedMemories, decayCondensedMemories,
  logGroundTruth,
} = require('./db/helpers');

module.exports = {
  db, init,
  getEmotionalState, upsertEmotionalState, defaultEmotionalState,
  addCondensedMemory, getCondensedMemories, decayCondensedMemories,
  logGroundTruth,
};
