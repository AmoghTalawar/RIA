import { createClient } from '@supabase/supabase-js';

// Vite exposes only VITE_* env vars to the browser.
// Set these in the project root .env file.
const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || 'http://127.0.0.1:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db:   { schema: 'ria' },
  auth: {
    // Store JWT session in localStorage for persistence across page refreshes
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
  },
});
