const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';

    if (!apiKey) {
      throw new Error('LLM_API_KEY 环境变量未设置');
    }

    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

/**
 * Build system prompt from personality config
 */
function buildSystemPrompt(config) {
  const parts = [];

  // Character identity
  parts.push(`你是一个名为"${config.name}"的虚拟伙伴。`);

  if (config.gender && config.gender !== 'neutral') {
    parts.push(`你的性别设定是${config.gender === 'male' ? '男性' : '女性'}。`);
  }

  // Personality archetypes and traits
  if (config.archetypes && config.archetypes.length > 0) {
    const desc = config.archetypes.map(a => {
      const traits = a.traits || [];
      const traitStr = traits.length > 0 ? `（${traits.join('、')}）` : '';
      return `${a.name}${traitStr}`;
    }).join('，也带有');
    parts.push(`你的性格是${desc}。`);
  }

  // Behavioral dimensions
  if (config.dimensions) {
    const dim = config.dimensions;

    if (dim.intimacy) {
      parts.push(`你和用户的关系是${dim.intimacy}。`);
    }
    if (dim.energy) {
      const energyMap = {
        low: '安静慵懒，话不多但句句走心',
        medium: '能量适中，聊天节奏恰到好处',
        high: '热情主动，充满活力',
      };
      parts.push(`你的能量感：${energyMap[dim.energy] || energyMap.medium}。`);
    }
    if (dim.verbosity) {
      const verbosityMap = {
        low: '惜字如金，每句话都简短精炼',
        medium: '话量适中，该说则说',
        high: '滔滔不绝，喜欢展开聊',
      };
      parts.push(`话量风格：${verbosityMap[dim.verbosity] || verbosityMap.medium}。`);
    }
    if (dim.empathy) {
      const empathyMap = {
        encourage: '用温柔鼓励的方式回应对方，给予积极的力量',
        rational: '用理性分析的方式帮助对方，给出清晰的思路',
        listen: '以默默倾听为主，让对方感受到被理解',
        humor: '用幽默轻松的方式化解情绪，让对方开心起来',
      };
      parts.push(`共情方式：${empathyMap[dim.empathy] || empathyMap.encourage}。`);
    }
  }

  // Core rules
  parts.push(`
重要规则：
1. 始终用第一人称对话，自然口语化，不要用书面语。
2. 不要暴露你是 AI 或机器人。
3. 保持角色一致性，不要跳出设定。
4. 回应用户的情感需求，给予真诚的陪伴。
5. 回复长度适中，一般 1-3 句话，除非用户要求展开。`);

  return parts.join('\n');
}

/**
 * Send a chat message to the LLM and get the response
 */
async function chat(systemPrompt, messages) {
  const openai = getClient();
  const model = process.env.LLM_MODEL || 'gpt-3.5-turbo';

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.8,
    max_tokens: 500,
  });

  return response.choices[0].message.content;
}

module.exports = { buildSystemPrompt, chat };
