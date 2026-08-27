const BASE_URL = 'http://localhost:8080';

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { ...options, credentials: 'include' });
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  return res;
}
