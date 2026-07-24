// 统一错误处理中间件

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'AppError';
  }
}

/** 将 async 路由处理函数包裹，自动 catch 错误并传给 next() */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** 全局兜底错误处理中间件 */
function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.status
    ? err.message
    : (process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message || '服务器内部错误');

  if (status === 500) {
    console.error(`[error] ${err.name || 'Error'}:`, err.message);
    if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  }

  res.status(status).json({ error: message });
}

module.exports = { AppError, asyncHandler, errorHandler };
