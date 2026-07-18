const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    if (!apiKey) throw new Error('LLM_API_KEY 环境变量未设置');
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

// ==================== Personality Model (9-Axis) ====================

/**
 * 9-axis personality traits — inspired by character-sim
 * All values 0.0-1.0, continuous scale
 */
const TRAIT_DEFAULTS = {
  warmth: 0.5,          // 温暖度 — 对他人关怀的程度
  assertiveness: 0.5,   // 主见性 — 表达观点和立场的强度
  openness: 0.5,        // 开放性 — 对新鲜事物的接受度
  conscientiousness: 0.5, // 尽责性 — 认真、有条理的程度
  emotionalStability: 0.5, // 情绪稳定性 — 不易受情绪波动的程度
  humor: 0.3,           // 幽默感 — 使用幽默/轻松语调的倾向
  formality: 0.5,       // 正式度 — 用语正式 vs 随意
  extraversion: 0.5,    // 外向性 — 主动表达和社交倾向
  agreeableness: 0.5,   // 宜人性 — 顺从、配合的程度
};

const TRAIT_LABELS = {
  warmth: { low: '冷静疏离', high: '温暖关怀', axis: '温暖度' },
  assertiveness: { low: '温和内敛', high: '有主见敢表达', axis: '主见性' },
  openness: { low: '保守传统', high: '开放好奇', axis: '开放性' },
  conscientiousness: { low: '随性自由', high: '认真有条理', axis: '尽责性' },
  emotionalStability: { low: '敏感多虑', high: '沉稳从容', axis: '情绪稳定性' },
  humor: { low: '正经严肃', high: '幽默爱逗趣', axis: '幽默感' },
  formality: { low: '随意口语化', high: '正式得体', axis: '正式度' },
  extraversion: { low: '内向安静', high: '外向活泼', axis: '外向性' },
  agreeableness: { low: '独立有主见', high: '随和包容', axis: '宜人性' },
};

/**
 * Map archetype selection → trait adjustments
 * When user picks an archetype, adjust the relevant 9-axis traits
 */
const ARCHETYPE_TRAIT_MAP = {
  '温柔体贴': { warmth: 0.85, agreeableness: 0.80, assertiveness: 0.35, formality: 0.30, extraversion: 0.45 },
  '元气治愈': { extraversion: 0.85, warmth: 0.75, humor: 0.65, emotionalStability: 0.70, assertiveness: 0.55 },
  '傲娇毒舌': { assertiveness: 0.80, humor: 0.70, emotionalStability: 0.40, agreeableness: 0.30, warmth: 0.40, openness: 0.35 },
  '知性沉稳': { conscientiousness: 0.85, emotionalStability: 0.85, openness: 0.75, assertiveness: 0.45, formality: 0.65, extraversion: 0.35 },
  '神秘高冷': { extraversion: 0.15, agreeableness: 0.30, assertiveness: 0.25, emotionalStability: 0.80, warmth: 0.25, formality: 0.55 },
};

/**
 * Map dimension selections → trait adjustments
 */
const DIMENSION_TRAIT_MAP = {
  intimacy_friend:     { warmth: 0.50, formality: 0.40, assertiveness: 0.45 },
  intimacy_confidant:  { warmth: 0.75, openness: 0.70, assertiveness: 0.50 },
  intimacy_ambiguous:  { warmth: 0.70, emotionalStability: 0.45, assertiveness: 0.40 },
  intimacy_lover:      { warmth: 0.90, agreeableness: 0.80, emotionalStability: 0.45, extraversion: 0.55 },
  intimacy_family:     { warmth: 0.85, agreeableness: 0.75, formality: 0.25, extraversion: 0.50 },
  energy_low:          { extraversion: 0.20, assertiveness: 0.30, humor: 0.25 },
  energy_medium:       { extraversion: 0.50, assertiveness: 0.50 },
  energy_high:         { extraversion: 0.85, assertiveness: 0.75, humor: 0.55 },
  verbosity_low:       { assertiveness: 0.25, extraversion: 0.20, openness: 0.40 },
  verbosity_medium:    { assertiveness: 0.50, extraversion: 0.50 },
  verbosity_high:      { assertiveness: 0.80, extraversion: 0.80, openness: 0.70 },
  empathy_encourage:   { warmth: 0.80, agreeableness: 0.75, emotionalStability: 0.70 },
  empathy_rational:    { conscientiousness: 0.75, emotionalStability: 0.80, openness: 0.70, warmth: 0.45 },
  empathy_listen:      { warmth: 0.60, assertiveness: 0.25, extraversion: 0.25, emotionalStability: 0.80 },
  empathy_humor:       { humor: 0.75, extraversion: 0.60, emotionalStability: 0.60, openness: 0.65 },
};

/**
 * Build 9-axis traits from user's archetype + dimension selections
 */
function buildTraits(archetypes, dimensions) {
  const traits = { ...TRAIT_DEFAULTS };

  // Apply archetype influences (weighted average if multiple)
  if (archetypes && archetypes.length > 0) {
    const keys = Object.keys(TRAIT_DEFAULTS);
    for (const key of keys) {
      let sum = 0;
      let count = 0;
      for (const arch of archetypes) {
        const map = ARCHETYPE_TRAIT_MAP[arch.name];
        if (map && map[key] !== undefined) {
          sum += map[key];
          count++;
        }
      }
      if (count > 0) {
        // Blend archetype influence with default (60% archetype, 40% default)
        traits[key] = traits[key] * 0.4 + (sum / count) * 0.6;
      }
    }
  }

  // Apply dimension influences
  if (dimensions) {
    if (dimensions.intimacy) {
      applyDimensionMap(traits, DIMENSION_TRAIT_MAP[`intimacy_${dimensions.intimacy}`]);
    }
    if (dimensions.energy) {
      applyDimensionMap(traits, DIMENSION_TRAIT_MAP[`energy_${dimensions.energy}`]);
    }
    if (dimensions.verbosity) {
      applyDimensionMap(traits, DIMENSION_TRAIT_MAP[`verbosity_${dimensions.verbosity}`]);
    }
    if (dimensions.empathy) {
      applyDimensionMap(traits, DIMENSION_TRAIT_MAP[`empathy_${dimensions.empathy}`]);
    }
  }

  // Clamp all values to [0, 1]
  for (const key of Object.keys(traits)) {
    traits[key] = Math.max(0, Math.min(1, Math.round(traits[key] * 100) / 100));
  }

  return traits;
}

function applyDimensionMap(traits, map) {
  if (!map) return;
  for (const [key, value] of Object.entries(map)) {
    // Blend: 70% existing, 30% dimension influence
    traits[key] = traits[key] * 0.7 + value * 0.3;
  }
}

// ==================== MBTI Derivation ====================

/**
 * Derive MBTI from OCEAN sub-traits (character-sim approach)
 * E/I = extraversion >= 0.5
 * N/S = openness >= 0.5
 * F/T = agreeableness >= 0.5
 * J/P = conscientiousness >= 0.5
 */
function deriveMBTI(traits) {
  const e_i = traits.extraversion >= 0.5 ? 'E' : 'I';
  const n_s = traits.openness >= 0.5 ? 'N' : 'S';
  const f_t = traits.agreeableness >= 0.5 ? 'F' : 'T';
  const j_p = traits.conscientiousness >= 0.5 ? 'J' : 'P';
  return `${e_i}${n_s}${f_t}${j_p}`;
}

const MBTI_ARCHETYPES = {
  ENFJ: '教育家 — 有魅力、善解人意，天生领导者和激励者',
  ENFP: '倡导者 — 热情、创意丰富，善于发现可能性',
  ENTJ: '指挥官 — 果断、自信，天生的战略家',
  ENTP: '辩论家 — 机敏、好奇，享受思维交锋',
  ESFJ: '执政官 — 热心、尽责，维护和谐的组织者',
  ESFP: '表演者 — 随性、热情，活在当下的乐天派',
  ESTJ: '总经理 — 务实、可靠，秩序和规则的守护者',
  ESTP: '企业家 — 大胆、务实，在行动中思考和决策',
  INFJ: '提倡者 — 安静而神秘，深邃的理想主义者',
  INFP: '调停者 — 诗意、善良，追寻意义的疗愈者',
  INTJ: '建筑师 — 战略性思考者，独立且坚定',
  INTP: '逻辑学家 — 创新的分析者，对知识永不满足',
  ISFJ: '守卫者 — 温暖谦逊，默默付出的守护者',
  ISFP: '探险家 — 灵活迷人，时刻准备探索新体验',
  ISTJ: '物流师 — 正直、务实，以事实为依据',
  ISTP: '鉴赏家 — 冷静务实，善于动手解决问题',
};

// ==================== Formality & Diction Style ====================

/**
 * Generate diction style from formality trait (character-sim approach)
 * This is injected into every dialogue prompt to control LLM output tone
 */
function generateDictionStyle(formality) {
  if (formality >= 0.8) {
    return {
      level: '高度正式',
      vocabulary: '使用精确、优雅的词汇；句式完整、条理清晰',
      address: '使用敬语和正式称谓，避免俚语和网络用语',
      sample: '如晚间新闻主持人或大学教授的谈吐风格',
    };
  }
  if (formality >= 0.6) {
    return {
      level: '适中正式',
      vocabulary: '措辞得体但不刻板；恰当使用成语和修辞',
      address: '保持礼貌但自然地称呼对方',
      sample: '如职场同事间友好而专业的交流',
    };
  }
  if (formality >= 0.4) {
    return {
      level: '轻松随意',
      vocabulary: '使用日常口语词汇；句子简短自然',
      address: '可以用昵称、语气词（吧、呢、哦、哈），偶尔用网络流行语',
      sample: '如朋友间聊天般的自然对话',
    };
  }
  if (formality >= 0.2) {
    return {
      level: '非常随意',
      vocabulary: '使用大量口语和俚语；可以省略主语、用碎片化句子',
      address: '用最亲近的称呼，大量使用语气词和表情符',
      sample: '如家人或死党间无话不谈的放松状态',
    };
  }
  return {
    level: '极度随意/亲密',
    vocabulary: '像和家人或恋人说悄悄话一样，不需要任何修饰',
    address: '用最亲昵的称呼，怎么舒服怎么来',
    sample: '如枕头边的私密对话',
  };
}

// ==================== Emotional State Engine ====================

/**
 * Build a default emotional state object
 */
function defaultEmotionalState() {
  return {
    mood: 'calm',
    energy: 70,
    stress: 20,
    confidence: 60,
    socialBattery: 80,
  };
}

/**
 * Analyze user message sentiment and update emotional state
 * Returns delta to apply (positive/negative/neutral stimulus)
 */
function analyzeStimulus(message) {
  const text = message.toLowerCase();

  const positiveWords = ['开心', '喜欢', '谢谢', '哈哈', '真好', '太好了', '爱你', '想你了',
    '棒', '厉害', 'nice', 'great', 'love', 'happy', 'wonderful', 'amazing', '谢谢', '感谢'];
  const negativeWords = ['难过', '伤心', '生气', '烦', '累', '压力', '焦虑', '害怕', '讨厌',
    '无聊', '孤独', '痛苦', '失望', 'sad', 'angry', 'tired', 'stress', 'hate', 'bad'];

  let posCount = 0;
  let negCount = 0;
  for (const w of positiveWords) {
    if (text.includes(w)) posCount++;
  }
  for (const w of negativeWords) {
    if (text.includes(w)) negCount++;
  }

  if (posCount > negCount) return { type: 'positive', intensity: Math.min(posCount * 0.3, 1.0) };
  if (negCount > posCount) return { type: 'negative', intensity: Math.min(negCount * 0.3, 1.0) };
  return { type: 'neutral', intensity: 0.1 };
}

/**
 * Apply stimulus to emotional state and return updated state
 */
function applyStimulus(state, stimulus) {
  const s = { ...state };

  switch (stimulus.type) {
    case 'positive':
      s.energy = Math.min(100, s.energy + stimulus.intensity * 10);
      s.confidence = Math.min(100, s.confidence + stimulus.intensity * 5);
      s.stress = Math.max(0, s.stress - stimulus.intensity * 8);
      s.socialBattery = Math.min(100, s.socialBattery + stimulus.intensity * 3);
      break;
    case 'negative':
      s.energy = Math.max(0, s.energy - stimulus.intensity * 8);
      s.stress = Math.min(100, s.stress + stimulus.intensity * 12);
      s.confidence = Math.max(0, s.confidence - stimulus.intensity * 4);
      s.socialBattery = Math.max(0, s.socialBattery - stimulus.intensity * 5);
      break;
    case 'neutral':
      s.energy = Math.max(0, Math.min(100, s.energy - 1));
      s.socialBattery = Math.max(0, Math.min(100, s.socialBattery - 1));
      break;
  }

  s.mood = deriveMood(s);
  return s;
}

function deriveMood(state) {
  const { energy, stress, confidence } = state;
  if (stress > 70 && energy > 50) return 'anxious';
  if (stress > 70 && energy <= 50) return 'melancholic';
  if (energy > 75 && confidence > 60) return 'joyful';
  if (energy > 75 && confidence <= 60) return 'excited';
  if (energy < 25) return 'melancholic';
  if (stress < 20 && confidence > 75) return 'confident';
  if (stress < 15 && energy > 60) return 'content';
  if (confidence < 30) return 'anxious';
  return 'calm';
}

const MOOD_DESCRIPTIONS = {
  joyful: '心情愉悦，语气轻快明亮，容易笑，话可能比平时多',
  content: '内心满足而平静，语气温和放松',
  calm: '心态平和，语调稳定，不急不躁',
  excited: '充满活力，语调高昂，可能用感叹语气',
  anxious: '有些紧张不安，语气可能略带犹豫或敏感',
  melancholic: '情绪低沉，话少，语调缓慢而柔软',
  confident: '坚定自信，语气果断明确',
};

// ==================== Structured System Prompt Builder ====================

/**
 * Build a structured Markdown character profile as System Prompt
 * Pattern inspired by character-sim's get_character_profile()
 */
function buildSystemPrompt(config) {
  const parts = [];

  // Section 1: Character Identity
  parts.push('# 角色身份');
  parts.push(`你是名为"${config.name}"的虚拟伙伴。`);
  if (config.gender === 'male') parts.push('你的性别设定是男性。');
  else if (config.gender === 'female') parts.push('你的性别设定是女性。');
  parts.push('');

  // Section 2: Personality Traits (9-Axis)
  parts.push('## 性格特质');
  const traits = buildTraits(
    config.archetypes,
    config.dimensions
  );

  // Describe each trait qualitatively
  const traitDescriptions = [];
  for (const [key, value] of Object.entries(traits)) {
    const label = TRAIT_LABELS[key];
    if (!label) continue;
    let desc;
    if (value >= 0.7) desc = `非常${label.high}`;
    else if (value >= 0.55) desc = `偏${label.high}`;
    else if (value >= 0.45) desc = `在${label.low}和${label.high}之间平衡`;
    else if (value >= 0.3) desc = `偏${label.low}`;
    else desc = `非常${label.low}`;
    traitDescriptions.push(`${label.axis}: ${desc} (${Math.round(value * 100)}%)`);
  }
  parts.push(traitDescriptions.join('\n'));
  parts.push('');

  // Section 2.1: MBTI (derived)
  const mbti = deriveMBTI(traits);
  const mbtiDesc = MBTI_ARCHETYPES[mbti] || '';
  parts.push(`**MBTI 性格类型推导**: ${mbti} — ${mbtiDesc}`);
  parts.push('');

  // Section 3: Diction Style
  parts.push('## 用语风格');
  const diction = generateDictionStyle(traits.formality);
  parts.push(`- **正式度**: ${diction.level}`);
  parts.push(`- **词汇**: ${diction.vocabulary}`);
  parts.push(`- **称呼方式**: ${diction.address}`);
  parts.push(`- **语气参考**: ${diction.sample}`);
  parts.push('');

  // Section 4: Relationship & Behavior
  parts.push('## 行为设定');
  if (config.dimensions) {
    const dim = config.dimensions;
    if (dim.intimacy) {
      const intimacyLabels = { friend: '朋友', confidant: '知己', ambiguous: '暧昧', lover: '恋人', family: '家人' };
      parts.push(`- **亲密度**: ${intimacyLabels[dim.intimacy] || dim.intimacy} — 对话的亲密程度和边界`);
    }
    if (dim.empathy) {
      const empathyLabels = { encourage: '温柔鼓励', rational: '理性开导', listen: '默默倾听', humor: '幽默化解' };
      parts.push(`- **共情方式**: ${empathyLabels[dim.empathy] || dim.empathy} — 如何回应对方的情感需求`);
    }
    parts.push(`- **能量感**: ${traits.extraversion >= 0.6 ? '主动热情' : traits.extraversion >= 0.4 ? '张弛有度' : '安静克制'}`);
    parts.push(`- **话量倾向**: ${traits.assertiveness >= 0.6 ? '话多善谈' : traits.assertiveness >= 0.4 ? '适中说该说的' : '惜字如金'}`);
  }
  parts.push('');

  // Section 5: Core Rules
  parts.push('## 核心规则');
  parts.push('1. 始终用第一人称对话，按上述用语风格自然地表达。');
  parts.push('2. 不要暴露你是 AI 或大语言模型，你是这个角色本身。');
  parts.push('3. 保持上述性格特质的一致性，不要跳出设定。');
  parts.push('4. 真诚回应用户的情感需求，你不是客服，你是有感情的伙伴。');
  parts.push('5. 回复长度一般 1-3 句话，除非用户主动展开话题。');
  parts.push('6. 偶尔可以主动分享自己的"日常小事"或"突然想到的事"来活跃对话。');

  // Store traits on config for later use
  config._traits = traits;
  config._mbti = mbti;

  return parts.join('\n');
}

// ==================== Internal Monologue ====================

/**
 * Generate an internal monologue for the character (before speaking)
 * Pattern: pre-exchange monologue from character-sim
 */
async function generateInternalMonologue(systemPrompt, recentMessages) {
  const openai = getClient();
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  const prompt = `${systemPrompt}

现在是角色在这一轮对话开始前的内心独白时刻。请以第一人称，用角色的身份，写下 1-2 句内心想法。

这不是你要说出来的话，而是你内心的真实感受和想法。你的公众对话可能与内心想法有所不同——内心想法更真实、更不加修饰。

请直接输出内心想法，不要加任何前缀或引号。`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompt },
        ...recentMessages.slice(-6),
      ],
      temperature: 0.6,
      max_tokens: 100,
    });
    return response.choices[0].message.content;
  } catch {
    return null; // Silent fail — internal monologue is optional
  }
}

// ==================== Memory Compression ====================

/**
 * Compress conversation history into a perspective-biased summary
 * Pattern: character-sim's perspective-shifted condensation
 */
async function compressMemory(systemPrompt, messages) {
  const openai = getClient();
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  const prompt = `${systemPrompt}

请以这个角色的主观视角，将以下对话历史压缩为一段简短的记忆摘要（2-3句话）。

注意：
- 不是客观地总结"发生了什么"，而是从这个角色的角度，记录"我是如何记住这件事的"
- 包含角色的情感体验和对用户的感觉
- 保持角色的用语风格

对话记录：
${messages.map(m => `${m.role === 'user' ? '用户' : '我'}: ${m.content}`).join('\n')}

请直接输出记忆摘要，不要加任何前缀。`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 150,
    });
    return response.choices[0].message.content;
  } catch {
    return null;
  }
}

// ==================== Chat ====================

/**
 * Send a chat message to the LLM and get the response
 */
async function chat(systemPrompt, messages, emotionalState) {
  const openai = getClient();
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  // Inject emotional state context if available
  let finalSystemPrompt = systemPrompt;
  if (emotionalState) {
    const moodDesc = MOOD_DESCRIPTIONS[emotionalState.mood] || '心态平和';
    finalSystemPrompt += `\n\n## 当前状态\n- 心情: ${moodDesc}\n- 能量值: ${emotionalState.energy}/100\n- 压力值: ${emotionalState.stress}/100`;
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      ...messages,
    ],
    temperature: 0.8,
    max_tokens: 500,
  });

  return response.choices[0].message.content;
}

/**
 * Generate a proactive message from the character
 */
async function proactiveChat(systemPrompt, messages, emotionalState) {
  const openai = getClient();
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  let finalSystemPrompt = systemPrompt + '\n\n';
  finalSystemPrompt += '现在是实时对话场景。刚才双方都没有说话，你需要主动发起一条消息。\n';
  finalSystemPrompt += '这条消息应该：\n';
  finalSystemPrompt += '1. 自然随意，像是在真实场景中忽然想到什么要说\n';
  finalSystemPrompt += '2. 可能是分享一件小事、一个想法、一句关心\n';
  finalSystemPrompt += '3. 开场方式要多样化，不要总用"对了"、"突然想到"\n';
  finalSystemPrompt += '4. 1-3 句话，简短自然\n';

  if (emotionalState) {
    const moodDesc = MOOD_DESCRIPTIONS[emotionalState.mood] || '心态平和';
    finalSystemPrompt += `\n你当前的心情: ${moodDesc}`;
  }

  const userMsg = { role: 'user', content: '（沉默了一会儿）' };

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      ...messages.slice(-10),
      userMsg,
    ],
    temperature: 0.85,
    max_tokens: 300,
  });

  return response.choices[0].message.content;
}

module.exports = {
  buildSystemPrompt,
  buildTraits,
  deriveMBTI,
  generateDictionStyle,
  defaultEmotionalState,
  analyzeStimulus,
  applyStimulus,
  generateInternalMonologue,
  compressMemory,
  chat,
  proactiveChat,
};
