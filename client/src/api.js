const API_BASE = '/api';

let token = localStorage.getItem('token');

export function setToken(t) {
  token = t;
  if (t) {
    localStorage.setItem('token', t);
  } else {
    localStorage.removeItem('token');
  }
}

export function getToken() {
  return token;
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    throw new Error('网络连接失败，请检查网络后重试');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

export function get(path) {
  return request(path);
}

export function post(path, body) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patch(path, body) {
  return request(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function put(path, body) {
  return request(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function del(path) {
  return request(path, { method: 'DELETE' });
}

// 便捷对象导出（供新板块使用）
export const api = { get, post, patch, put, del };
