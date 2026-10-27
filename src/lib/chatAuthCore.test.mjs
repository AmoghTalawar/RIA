// Run: node --test src/lib/chatAuthCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthedFetch, describeChatError, shortLabel, ChatAuthError } from './chatAuthCore.js';

const session = (t) => ({ data: { session: t ? { access_token: t } : null } });
const res = (status) => ({ status, ok: status >= 200 && status < 300 });

function harness({ token = 'tok-1', statuses = [200], refreshed = 'tok-2', refreshError = null } = {}) {
  const calls = [];
  let i = 0;
  const api = createAuthedFetch({
    getSession: async () => session(token),
    refreshSession: async () => (refreshError ? { data: null, error: refreshError } : { data: session(refreshed).data, error: null }),
    fetchImpl: async (url, init) => { calls.push({ url, init }); return res(statuses[Math.min(i++, statuses.length - 1)]); },
  });
  return { api, calls };
}

test('adds the bearer token and keeps caller headers and body', async () => {
  const { api, calls } = harness();
  const r = await api('http://x/chat', { method: 'POST', headers: { 'X-Groq-Key': 'k', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-1');
  assert.equal(calls[0].init.headers['X-Groq-Key'], 'k');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{}');
});

test('no session -> ChatAuthError and no request is made', async () => {
  const { api, calls } = harness({ token: null });
  await assert.rejects(() => api('http://x/chat'), (e) => e instanceof ChatAuthError);
  assert.equal(calls.length, 0);
});

test('401 refreshes once and retries with the new token', async () => {
  const { api, calls } = harness({ statuses: [401, 200] });
  const r = await api('http://x/chat');
  assert.equal(r.status, 200);
  assert.deepEqual(calls.map((c) => c.init.headers.Authorization), ['Bearer tok-1', 'Bearer tok-2']);
});

test('401 that persists is returned after exactly one retry', async () => {
  const { api, calls } = harness({ statuses: [401, 401, 401] });
  assert.equal((await api('http://x/chat')).status, 401);
  assert.equal(calls.length, 2);
});

test('401 with a failed refresh is returned without a retry', async () => {
  const { api, calls } = harness({ statuses: [401, 200], refreshError: new Error('nope') });
  assert.equal((await api('http://x/chat')).status, 401);
  assert.equal(calls.length, 1);
});

test('401 where refresh returns the same token does not loop', async () => {
  const { api, calls } = harness({ statuses: [401, 200], refreshed: 'tok-1' });
  assert.equal((await api('http://x/chat')).status, 401);
  assert.equal(calls.length, 1);
});

test('403 and 5xx are not retried', async () => {
  for (const s of [403, 500, 503]) {
    const { api, calls } = harness({ statuses: [s] });
    assert.equal((await api('http://x/chat')).status, s);
    assert.equal(calls.length, 1);
  }
});

test('describeChatError', () => {
  assert.match(describeChatError(401, 'x'), /session has expired/i);
  assert.equal(describeChatError(403, 'This HoD profile has no department.'), 'This HoD profile has no department.');
  assert.match(describeChatError(403, undefined), /does not have access/i);
  assert.match(describeChatError(503, ''), /temporarily unavailable/i);
  assert.equal(describeChatError(502, 'upstream failed'), 'Sorry, I ran into an error: upstream failed');
  assert.equal(describeChatError(500, undefined), 'Sorry, I ran into an error: HTTP 500');
  assert.match(describeChatError(400, { a: 1 }), /"a":1/);
});

test('shortLabel', () => {
  assert.equal(shortLabel('Short one'), 'Short one');
  const long = 'Which faculty in our department have not published in the last 12 months?';
  const s = shortLabel(long);
  assert.ok(s.length <= 42 && s.endsWith('…'), s);
  assert.equal(shortLabel(null), '');
});
