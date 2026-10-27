import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

// ── Role → route mapping (keyed by frontend role string) ──────────────────
export const ROLE_ROUTES = {
  staff:            '/staff',
  hod:              '/department',
  'faculty-dean':   '/faculty-dean',
  'executive-dean': '/executive-dean',
  'university-dean':'/university',
};

// ── Role display labels ────────────────────────────────────────────────────
export const ROLE_LABELS = {
  staff:            'Faculty',
  hod:              'Head of Department',
  'faculty-dean':   'Faculty Dean',
  'executive-dean': 'Executive Dean',
  'university-dean':'Vice Chancellor',
};

// ── Map Supabase DB role_level + dean_type → frontend role key ─────────────
// DB enum: Faculty | HoD | Dean | VC | Admin
function mapDbRoleToFrontend(roleLevel, deanType) {
  switch (roleLevel) {
    case 'Faculty': return 'staff';
    case 'HoD':     return 'hod';
    case 'Dean':
      return deanType === 'executive_dean' ? 'executive-dean' : 'faculty-dean';
    case 'VC':
    case 'Admin':
      return 'university-dean';
    default:
      return 'staff';
  }
}

// ── Fetch ria.profiles row for the logged-in user ─────────────────────────
async function fetchUserProfile(authUser) {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      full_name,
      role_level,
      dean_type,
      ria_user_id,
      department_id,
      institute_id,
      departments ( name ),
      institutes  ( name )
    `)
    .eq('id', authUser.id)
    .maybeSingle();

  if (error || !data) {
    console.error('[AuthContext] Profile fetch error:', error?.message);
    return null;
  }

  const frontendRole = mapDbRoleToFrontend(data.role_level, data.dean_type);

  return {
    id:           authUser.id,
    email:        authUser.email,
    name:         data.full_name || authUser.email,
    role:         frontendRole,
    roleLevel:    data.role_level,
    deanType:     data.dean_type,
    riaUserId:    data.ria_user_id,
    department:   data.departments?.name || '',
    institute:    data.institutes?.name  || '',
  };
}

// ── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Track whether this effect is still mounted to avoid state updates after unmount
    let active = true;
    // Track the last user ID we've fetched a profile for, to deduplicate
    // concurrent calls from getSession() and onAuthStateChange()
    let resolvedUserId = null;

    // ── Initialise session on mount ─────────────────────────────────────────
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[AuthContext] getSession error:', error.message);
          return;
        }
        if (session?.user && active) {
          resolvedUserId = session.user.id;
          const profile = await fetchUserProfile(session.user);
          if (active) setUser(profile);
        }
      } catch (err) {
        console.error('[AuthContext] Unexpected error during session init:', err);
      } finally {
        // ALWAYS release the loading state — this is the key fix.
        // Without this, any error above would leave loading=true forever
        // and the app would render a permanent blank/white screen on refresh.
        if (active) setLoading(false);
      }
    };

    initSession();

    // ── Listen for auth state changes (login / logout / token refresh) ──────
    // NOTE: this callback runs while supabase-js holds its auth lock, so it must NOT await any
    // supabase call (fetchUserProfile queries the DB, which needs that same lock → deadlock, and
    // getSession() above never resolves → permanent spinner on refresh). Do the work in a
    // deferred task instead.
    const loadProfile = (authUser) => {
      setTimeout(async () => {
        try {
          const profile = await fetchUserProfile(authUser);
          if (active) setUser(profile);
        } catch (err) {
          console.error('[AuthContext] onAuthStateChange error:', err);
        }
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // Skip duplicate fetch if getSession() already resolved this user
          if (session.user.id === resolvedUserId) return;
          resolvedUserId = session.user.id;
          loadProfile(session.user);
        } else if (event === 'SIGNED_OUT') {
          resolvedUserId = null;
          if (active) setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Re-fetch profile on token refresh in case role changed
          if (session.user.id !== resolvedUserId) {
            resolvedUserId = session.user.id;
            loadProfile(session.user);
          }
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Login via Supabase Auth (email + password → JWT) ────────────────────
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    email.trim(),
      password: password.trim(),
    });

    if (error) {
      return { success: false, message: error.message };
    }

    const profile = await fetchUserProfile(data.user);
    if (!profile) {
      return {
        success: false,
        message: 'Account exists but no role profile found. Contact admin.',
      };
    }

    setUser(profile);
    return { success: true, role: profile.role };
  };

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
