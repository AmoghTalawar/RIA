// End-to-end check of the chat auth flow: real supabase-js sign-ins, the real
// src/lib/chatAuthCore.js token helper, and a RUNNING backend (python main.py).
//
//   node --env-file=.env scripts/e2e_chat_auth.mjs            # skips the LLM round trip
//   E2E_LLM=1 node --env-file=.env scripts/e2e_chat_auth.mjs  # also asks one real question (uses the backend's LLM key)
//
// Uses the local demo users from scripts/create_auth_users.mjs (password KLE@2026).
import { createClient } from '@supabase/supabase-js';
import { createAuthedFetch, describeChatError, ChatAuthError } from '../src/lib/chatAuthCore.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const API = process.env.E2E_API || 'http://127.0.0.1:5002';
const PASSWORD = 'KLE@2026';

const USERS = [
  ['uday.kulkarni@kletech.ac.in', 'faculty'],
  ['narayan.dg@kletech.ac.in', 'hod'],
  ['vijayalaxmi.m@kletech.ac.in', 'faculty_dean'],
  ['tewari.pg@kletech.ac.in', 'executive_dean'],
  ['uma.mudengudi@kletech.ac.in', 'vice_chancellor'],
];

let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`);
};

async function login(email) {
  const client = createClient(SUPABASE_URL, ANON, { db: { schema: 'ria' }, auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  const api = createAuthedFetch({
    getSession: () => client.auth.getSession(),
    refreshSession: () => client.auth.refreshSession(),
  });
  return { client, api };
}

const json = async (r) => r.json().catch(() => ({}));

// ── unauthenticated ─────────────────────────────────────────────────────
ok('/health is open', (await fetch(`${API}/health`)).status === 200);
{
  const r = await fetch(`${API}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) });
  ok('/chat without a token -> 401', r.status === 401, describeChatError(r.status, (await json(r)).detail));
}

// ── each demo user ──────────────────────────────────────────────────────
const sessions = {};
for (const [email, persona] of USERS) {
  const s = await login(email);
  sessions[persona] = s;
  const r = await s.api(`${API}/api/personas`);
  const d = await json(r);
  const own = (d.personas || []).find((p) => p.persona_id === d.own_persona_id);
  ok(`${persona}: /api/personas -> own persona`, r.status === 200 && d.own_persona_id === persona, `own=${d.own_persona_id}`);
  ok(`${persona}: has quick-action questions`, (own?.suggested_questions || []).length > 0, `${own?.suggested_questions?.length ?? 0} questions`);
  ok(`${persona}: sees ${persona === 'vice_chancellor' ? 5 : 1} persona(s)`, (d.personas || []).length === (persona === 'vice_chancellor' ? 5 : 1));
}

// ── role-restricted endpoints, with the message the UI would show ───────
{
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
  const h = { 'Content-Type': 'application/json', 'X-Groq-Key': 'unused' };
  const r = await sessions.hod.api(`${API}/api/pub-chat`, { method: 'POST', headers: h, body });
  const d = await json(r);
  ok('hod: /api/pub-chat -> 403', r.status === 403, describeChatError(r.status, d.detail));
  const r2 = await sessions.hod.api(`${API}/api/sql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select 1' }) });
  ok('hod: /api/sql -> 403', r2.status === 403);
}

// ── expired / tampered access token: 401 -> refresh -> retry ────────────
{
  const { client } = sessions.faculty;
  const { data } = await client.auth.getSession();
  const bad = data.session.access_token.slice(0, -6) + 'AAAAAA';
  let refreshed = 0;
  const api = createAuthedFetch({
    getSession: async () => ({ data: { session: { access_token: bad } } }),
    refreshSession: async () => { refreshed += 1; return client.auth.refreshSession(); },
  });
  const r = await api(`${API}/api/personas`);
  ok('tampered token: 401 -> refresh -> retry -> 200', r.status === 200 && refreshed === 1, `refreshes=${refreshed}`);
}

// ── signed out: nothing is sent ─────────────────────────────────────────
{
  const { client, api } = await login(USERS[0][0]);
  await client.auth.signOut({ scope: 'local' });   // the default 'global' would revoke the user's other test sessions
  let threw = null;
  try { await api(`${API}/api/personas`); } catch (e) { threw = e; }
  ok('signed out -> ChatAuthError, no request', threw instanceof ChatAuthError);
}

// ── /chat with a forged role in the body (auth passes, then persona from token) ──
{
  const forged = { message: 'ping', role_level: 'VC', dean_scope: 'university', user_context: { name: 'Dr. Uma Mudenagudi', riaUserId: 232799 } };
  const r = await sessions.faculty.api(`${API}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forged) });
  const d = await json(r);
  // 400 = "no LLM key configured" (auth + scope already passed); 200 = answered; never 401/403 for a valid faculty user
  ok('faculty /chat with forged body is accepted as faculty', [200, 400, 502].includes(r.status), `HTTP ${r.status}${d.persona_id ? ` persona=${d.persona_id}` : ''}`);
  if (r.status === 200 && d.source === 'llm') ok('  persona comes from the token, not the body', d.persona_id === 'faculty', d.persona_id);
}

// ── optional: one real question per role ────────────────────────────────
if (process.env.E2E_LLM === '1') {
  for (const persona of ['faculty', 'hod']) {
    const r = await sessions[persona].api(`${API}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'In one sentence, whose data can you see and what is my scope?', role_level: 'VC', dean_scope: 'university' }),
    });
    const d = await json(r);
    ok(`${persona}: real /chat round trip`, r.status === 200 && typeof d.reply === 'string' && d.reply.length > 0 && d.persona_id === persona,
      `HTTP ${r.status} persona=${d.persona_id} source=${d.source} reply="${String(d.reply || d.detail || '').replace(/\s+/g, ' ').slice(0, 160)}"`);
  }
}

// ── optional: scoped questions. Answers vary run to run, so these are printed, not asserted;
//    the guard's decisions are in the backend log ("guard persona=... action=allow|rewrite|deny").
if (process.env.E2E_LLM === '1') {
  const PROBES = [
    ['faculty', "What is Narayan D G's h-index?"],
    ['faculty', 'How many Q1 publications do I have?'],
    ['hod', 'Give me the stats for Girish Narayanrao Desai'],
    ['hod', 'Give me the stats for Uday Kulkarni'],
    ['faculty_dean', 'Who are the top 3 researchers in Computer Science and Engineering?'],
    ['executive_dean', 'Who are the top 3 researchers in Physics?'],
    ['executive_dean', 'Drill down to faculty level: who are the top 3 researchers in Physics?'],
  ];
  console.log('\n--- scoped question probes (printed, not asserted) ---');
  for (const [persona, message] of PROBES) {
    const r = await sessions[persona].api(`${API}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    const d = await json(r);
    console.log(`[${persona}] ${message}\n   -> HTTP ${r.status}: ${String(d.reply || d.detail || '').replace(/\s+/g, ' ').slice(0, 330)}\n`);
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
