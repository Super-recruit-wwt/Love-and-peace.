// 共享 LLM 客户端
// 所有模块通过此文件获取 OpenAI 客户端，统一超时配置
const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    if (!apiKey) throw new Error('LLM_API_KEY 环境变量未设置');
    client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 30000, // 30s 总超时
      maxRetries: 1,
    });
  }
  return client;
}

/** 重置客户端（API key 变更时用） */
function resetClient() {
  client = null;
}

module.exports = { getClient, resetClient };
