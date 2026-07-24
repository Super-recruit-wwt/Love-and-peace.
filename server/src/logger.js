// 轻量结构化日志（零第三方依赖）
// 生产环境搜 JSON 日志字段；开发环境也能直接阅读

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(name) {
  const minLevel = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

  function log(level, msg, data) {
    if (LEVELS[level] < minLevel) return;
    const entry = {
      level,
      name,
      msg,
      ...(data || {}),
      ts: new Date().toISOString(),
    };
    if (level === 'error') console.error(JSON.stringify(entry));
    else if (level === 'warn') console.warn(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  };
}

module.exports = { createLogger };
