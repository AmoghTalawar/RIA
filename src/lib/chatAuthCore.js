// Pure helpers for calling the RIA backend with the signed-in user's Supabase
// access token. No Vite / browser-only imports, so `node --test` can run them.
//
// The backend (backend/auth_scope.py) takes role and scope ONLY from this token.
// Never send role_level / dean_scope / user_context in a request body: they are ignored.

export class ChatAuthError extends Error {
  constructor(message = 'Not signed in') {
    super(message);
    this.name = 'ChatAuthError';
  }
}

/**
 * Build a fetch wrapper that adds `Authorization: Bearer <access token>`.
 * On a 401 it refreshes the session once and retries with the new token.
 *
 * @param {{ getSession: () => Promise<any>, refreshSession: () => Promise<any>, fetchImpl?: typeof fetch }} deps
 */
export function createAuthedFetch({ getSession, refreshSession, fetchImpl }) {
  return async function authedFetch(url, init = {}) {
    const doFetch = fetchImpl || globalThis.fetch;
    const { data } = (await getSession()) || {};
    const token = data?.session?.access_token;
    if (!token) throw new ChatAuthError();

    const send = (t) => doFetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` },
    });

    let resp = await send(token);
    if (resp.status === 401) {
      const { data: refreshed, error } = (await refreshSession()) || {};
      const fresh = refreshed?.session?.access_token;
      if (!error && fresh && fresh !== token) resp = await send(fresh);
    }
    return resp;
  };
}

/** User-facing text for a failed backend call. `detail` is FastAPI's `detail` field. */
export function describeChatError(status, detail) {
  const text = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : '';
  if (status === 401) return 'Your session has expired. Please sign out and sign in again.';
  if (status === 403) return text || 'Your account does not have access to this.';
  if (status === 503) return text || 'The service is temporarily unavailable. Please try again shortly.';
  return `Sorry, I ran into an error: ${text || `HTTP ${status}`}`;
}

/** Short pill label for a suggested question, e.g. "Which faculty in our department…". */
export function shortLabel(question, max = 42) {
  const q = String(question || '').trim();
  return q.length <= max ? q : `${q.slice(0, max - 1).trimEnd()}…`;
}
