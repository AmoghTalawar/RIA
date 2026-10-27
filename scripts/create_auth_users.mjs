/**
 * RIA Dashboard — Create Auth Users via Supabase Admin API
 *
 * This script uses the GoTrue Admin API (service role key) to create
 * the 5 named users properly. This is the CORRECT approach — raw SQL
 * inserts into auth.users bypass GoTrue's internal setup and cause
 * "Database error querying schema" on login.
 *
 * Usage:
 *   node scripts/create_auth_users.mjs
 *
 * Requirements:
 *   - Local Supabase must be running (npm run supabase:start or supabase start)
 *   - @supabase/supabase-js already installed
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────
// Local Supabase defaults (same for every local Supabase CLI project)
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL      || 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  // Default local Supabase CLI service role key
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0';

// ── Users to create ────────────────────────────────────────────────────────
const USERS = [
  {
    email:     'uday.kulkarni@kletech.ac.in',
    password:  'KLE@2026',
    full_name: 'Uday Kulkarni',
    role:      'Faculty',
    route:     '/staff',
  },
  {
    email:     'narayan.dg@kletech.ac.in',
    password:  'KLE@2026',
    full_name: 'Narayan D G',
    role:      'HoD',
    route:     '/department',
  },
  {
    email:     'vijayalaxmi.m@kletech.ac.in',
    password:  'KLE@2026',
    full_name: 'Vijayalaxmi M',
    role:      'Dean (Faculty Dean)',
    route:     '/faculty-dean',
  },
  {
    email:     'tewari.pg@kletech.ac.in',
    password:  'KLE@2026',
    full_name: 'Tewari P G',
    role:      'Dean (Executive Dean)',
    route:     '/executive-dean',
  },
  {
    email:     'uma.mudengudi@kletech.ac.in',
    password:  'KLE@2026',
    full_name: 'Uma Mudengudi',
    role:      'VC',
    route:     '/university',
  },
];

// ── Admin client (service role — never expose to browser) ─────────────────
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken:  false,
    persistSession:    false,
    detectSessionInUrl: false,
  },
});

// ── Helper: delete existing user by email ─────────────────────────────────
async function deleteExistingUser(email) {
  const { data: list, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) return;
  const existing = list?.users?.find(u => u.email === email);
  if (existing) {
    await adminClient.auth.admin.deleteUser(existing.id);
    console.log(`  🗑  Deleted existing user: ${email}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  RIA Dashboard — Create Auth Users');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log('══════════════════════════════════════════════\n');

  const results = [];

  for (const user of USERS) {
    console.log(`Creating: ${user.full_name} <${user.email}>`);

    // Step 1: Clean up any broken previous user
    await deleteExistingUser(user.email);

    // Step 2: Create via GoTrue Admin API
    const { data, error } = await adminClient.auth.admin.createUser({
      email:          user.email,
      password:       user.password,
      email_confirm:  true,          // skip email verification
      user_metadata:  { full_name: user.full_name },
    });

    if (error) {
      console.error(`  ❌ Failed: ${error.message}`);
      results.push({ email: user.email, status: 'FAILED', error: error.message });
      continue;
    }

    const uid = data.user.id;
    console.log(`  ✅ Auth user created — UUID: ${uid}`);

    results.push({
      email:  user.email,
      uid,
      role:   user.role,
      route:  user.route,
      status: 'OK',
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════');
  results.forEach(r => {
    const icon = r.status === 'OK' ? '✅' : '❌';
    console.log(`${icon}  ${r.email}  →  ${r.route || r.error}`);
  });

  const succeeded = results.filter(r => r.status === 'OK');
  console.log(`\n  ${succeeded.length}/${USERS.length} users created successfully`);

  if (succeeded.length > 0) {
    console.log('\n══════════════════════════════════════════════');
    console.log('  NEXT STEP: Run this SQL in Supabase Editor');
    console.log('  to insert ria.profiles for these users:');
    console.log('══════════════════════════════════════════════');
    console.log('\n-- Copy and run this SQL in Supabase SQL Editor:\n');

    // Print the profiles SQL with actual UUIDs
    const uuidMap = Object.fromEntries(succeeded.map(r => [r.email, r.uid]));
    printProfilesSQL(uuidMap);
  }

  console.log('\n');
}

// ── Generate ria.profiles SQL with real UUIDs ─────────────────────────────
function printProfilesSQL(uuidMap) {
  const sql = `
-- ria.profiles — run in Supabase SQL Editor after create_auth_users.mjs
-- First ensure dean_type column exists:
ALTER TABLE ria.profiles
    ADD COLUMN IF NOT EXISTS dean_type TEXT
        CHECK (dean_type IN ('faculty_dean', 'executive_dean'));

-- Allow anon reads for profile fetch after login:
DO $$ BEGIN DROP POLICY IF EXISTS "prof_anon_read" ON ria.profiles; END $$;
CREATE POLICY "prof_anon_read" ON ria.profiles FOR SELECT TO anon USING (true);

-- Insert profiles:
INSERT INTO ria.profiles (id, full_name, role_level, department_id, institute_id, dean_type, is_active)
SELECT
    vals.uid::uuid,
    vals.full_name,
    vals.role_level::ria.role_level_t,
    d.id AS department_id,
    i.id AS institute_id,
    vals.dean_type,
    true
FROM (VALUES
    ('${uuidMap['uday.kulkarni@kletech.ac.in'] || 'MISSING'}',
     'Uday Kulkarni',  'Faculty', 'Computer Science and Engineering', 'CSE',       NULL),
    ('${uuidMap['narayan.dg@kletech.ac.in'] || 'MISSING'}',
     'Narayan D G',    'HoD',     'Computer Science and Engineering', 'CSE',       NULL),
    ('${uuidMap['vijayalaxmi.m@kletech.ac.in'] || 'MISSING'}',
     'Vijayalaxmi M',  'Dean',    NULL,                               'CSE',       'faculty_dean'),
    ('${uuidMap['tewari.pg@kletech.ac.in'] || 'MISSING'}',
     'Tewari P G',     'Dean',    NULL,                               'Mechanical','executive_dean'),
    ('${uuidMap['uma.mudengudi@kletech.ac.in'] || 'MISSING'}',
     'Uma Mudengudi',  'VC',      NULL,                               'Sciences',  NULL)
) AS vals(uid, full_name, role_level, dept_name, inst_short, dean_type)
LEFT JOIN ria.institutes  i ON i.short_name = vals.inst_short
LEFT JOIN ria.departments d ON d.name = vals.dept_name AND d.institute_id = i.id
ON CONFLICT (id) DO UPDATE
    SET full_name     = EXCLUDED.full_name,
        role_level    = EXCLUDED.role_level,
        department_id = EXCLUDED.department_id,
        institute_id  = EXCLUDED.institute_id,
        dean_type     = EXCLUDED.dean_type,
        updated_at    = NOW();

SELECT p.full_name, p.role_level, p.dean_type, u.email
FROM ria.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email LIKE '%kletech.ac.in'
ORDER BY p.created_at;
`;
  console.log(sql);
}

main().catch(err => {
  console.error('\n❌ Script failed:', err.message);
  process.exit(1);
});
