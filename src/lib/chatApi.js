import { supabase } from '../supabaseClient';
import { createAuthedFetch } from './chatAuthCore';

export { ChatAuthError, describeChatError, shortLabel } from './chatAuthCore';

/** fetch() with the current Supabase session's access token; see chatAuthCore.js. */
export const authedFetch = createAuthedFetch({
  getSession: () => supabase.auth.getSession(),
  refreshSession: () => supabase.auth.refreshSession(),
});
