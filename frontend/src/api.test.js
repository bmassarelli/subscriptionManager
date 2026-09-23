import { apiFetch } from './api';

afterEach(() => {
  jest.restoreAllMocks();
});

test('apiFetch always sends credentials: include', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({}) });

  await apiFetch('/api/subscriptions');

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/subscriptions',
    expect.objectContaining({ credentials: 'include' }),
  );
});

test('apiFetch preserves caller-supplied options alongside credentials', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({}) });

  await apiFetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8080/api/clients',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' },
  );
});

test('apiFetch dispatches auth:unauthorized when the response is a 401', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) });
  const listener = jest.fn();
  window.addEventListener('auth:unauthorized', listener);

  await apiFetch('/api/subscriptions');

  expect(listener).toHaveBeenCalledTimes(1);
  window.removeEventListener('auth:unauthorized', listener);
});

test('apiFetch does not dispatch auth:unauthorized on a non-401 response', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({}) });
  const listener = jest.fn();
  window.addEventListener('auth:unauthorized', listener);

  await apiFetch('/api/subscriptions');

  expect(listener).not.toHaveBeenCalled();
  window.removeEventListener('auth:unauthorized', listener);
});
