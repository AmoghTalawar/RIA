-- ============================================================
--  RIA — Research Intelligence & Analytics
--  MIGRATION 004 (v3 FIXED): JWT Auth Users + Role Profiles
--  Schema v3.1  |  Supabase / PostgreSQL 15+
--  KLE Technological University
--
--  FIXES applied vs previous versions:
--    v1: used auth.create_user(jsonb) — does not exist
--    v2: auth.identities had wrong provider_id (UUID instead of email)
--        and missing email_verified:true in identity_data
--    v3 (this): correct auth.identities structure for GoTrue email auth
--
--  Run this in: Supabase Dashboard → SQL Editor
--  Safe to re-run: all INSERTs use ON CONFLICT DO NOTHING / DO UPDATE
-- ============================================================


-- ============================================================
-- STEP 0: Clean up broken users from previous failed runs
--         (removes users with wrong identities so we can re-insert)
-- ============================================================
DO $$
DECLARE
    emails TEXT[] := ARRAY[
        'uday.kulkarni@kletech.ac.in',
        'narayan.dg@kletech.ac.in',
        'vijayalaxmi.m@kletech.ac.in',
        'tewari.pg@kletech.ac.in',
        'uma.mudengudi@kletech.ac.in'
    ];
    uid UUID;
    em  TEXT;
BEGIN
    FOREACH em IN ARRAY emails LOOP
        SELECT id INTO uid FROM auth.users WHERE email = em;
        IF uid IS NOT NULL THEN
            -- Delete in reverse dependency order
            DELETE FROM auth.identities WHERE user_id = uid;
            DELETE FROM ria.profiles    WHERE id = uid;
            DELETE FROM auth.users      WHERE id = uid;
            RAISE NOTICE 'Cleaned up existing user: %', em;
        END IF;
    END LOOP;
END $$;


-- ============================================================
-- STEP 1: Add dean_type column to ria.profiles (idempotent)
-- ============================================================
ALTER TABLE ria.profiles
    ADD COLUMN IF NOT EXISTS dean_type TEXT
        CHECK (dean_type IN ('faculty_dean', 'executive_dean'));

COMMENT ON COLUMN ria.profiles.dean_type IS
    'Sub-type for Dean role: faculty_dean or executive_dean. NULL for all other roles.';


-- ============================================================
-- STEP 2: Allow anon role to SELECT from ria.profiles
-- ============================================================
DO $$
BEGIN
    DROP POLICY IF EXISTS "prof_anon_read" ON ria.profiles;
END $$;

CREATE POLICY "prof_anon_read" ON ria.profiles
    FOR SELECT TO anon USING (true);


-- ============================================================
-- STEP 3: Create 5 users
--
--  auth.users    — credentials + session data
--  auth.identities — CRITICAL for GoTrue email/password login:
--      id            = user UUID  (for email provider)
--      provider_id   = EMAIL ADDRESS  (not UUID — this was the bug)
--      identity_data = must include email_verified: true
--  ria.profiles  — role + name + department
-- ============================================================

DO $$
DECLARE
    uid_uday        UUID;
    uid_narayan     UUID;
    uid_vijaya      UUID;
    uid_tewari      UUID;
    uid_uma         UUID;

    dept_cse_id      UUID;
    dept_mech_id     UUID;
    inst_cse_id      UUID;
    inst_mech_id     UUID;
    inst_sciences_id UUID;

    hashed_pw        TEXT;
BEGIN

    -- Single bcrypt hash for all users (cost factor 10)
    hashed_pw := crypt('KLE@2026', gen_salt('bf', 10));

    -- ── Resolve department / institute UUIDs ──────────────────
    SELECT id INTO inst_cse_id
        FROM ria.institutes WHERE short_name = 'CSE' LIMIT 1;

    SELECT id INTO inst_mech_id
        FROM ria.institutes WHERE short_name = 'Mechanical' LIMIT 1;

    SELECT id INTO inst_sciences_id
        FROM ria.institutes WHERE short_name = 'Sciences' LIMIT 1;

    SELECT id INTO dept_cse_id
        FROM ria.departments
        WHERE name = 'Computer Science and Engineering'
          AND institute_id = inst_cse_id
        LIMIT 1;

    SELECT id INTO dept_mech_id
        FROM ria.departments
        WHERE name = 'Mechanical Engineering'
          AND institute_id = inst_mech_id
        LIMIT 1;

    -- ── Generate fresh UUIDs ──────────────────────────────────
    uid_uday    := gen_random_uuid();
    uid_narayan := gen_random_uuid();
    uid_vijaya  := gen_random_uuid();
    uid_tewari  := gen_random_uuid();
    uid_uma     := gen_random_uuid();


    -- ════════════════════════════════════════════════════════
    -- auth.users
    -- ════════════════════════════════════════════════════════
    INSERT INTO auth.users (
        instance_id, id, aud, role,
        email, encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at, updated_at
    ) VALUES

    ('00000000-0000-0000-0000-000000000000', uid_uday,
     'authenticated', 'authenticated',
     'uday.kulkarni@kletech.ac.in', hashed_pw, NOW(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Uday Kulkarni"}',
     false, NOW(), NOW()),

    ('00000000-0000-0000-0000-000000000000', uid_narayan,
     'authenticated', 'authenticated',
     'narayan.dg@kletech.ac.in', hashed_pw, NOW(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Narayan D G"}',
     false, NOW(), NOW()),

    ('00000000-0000-0000-0000-000000000000', uid_vijaya,
     'authenticated', 'authenticated',
     'vijayalaxmi.m@kletech.ac.in', hashed_pw, NOW(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Vijayalaxmi M"}',
     false, NOW(), NOW()),

    ('00000000-0000-0000-0000-000000000000', uid_tewari,
     'authenticated', 'authenticated',
     'tewari.pg@kletech.ac.in', hashed_pw, NOW(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Tewari P G"}',
     false, NOW(), NOW()),

    ('00000000-0000-0000-0000-000000000000', uid_uma,
     'authenticated', 'authenticated',
     'uma.mudengudi@kletech.ac.in', hashed_pw, NOW(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Uma Mudengudi"}',
     false, NOW(), NOW())

    ON CONFLICT (id) DO NOTHING;


    -- ════════════════════════════════════════════════════════
    -- auth.identities  ← THIS IS WHAT ENABLES EMAIL LOGIN
    --
    --  CORRECT structure for GoTrue email provider:
    --    id          = user UUID  (same as user_id)
    --    provider_id = EMAIL ADDRESS  (NOT the UUID)
    --    identity_data must include:
    --      sub              = user UUID as string
    --      email            = email address
    --      email_verified   = true   ← CRITICAL, was missing before
    --      phone_verified   = false
    -- ════════════════════════════════════════════════════════
    INSERT INTO auth.identities (
        id, user_id,
        identity_data,
        provider,
        provider_id,        -- ← EMAIL ADDRESS (not UUID)
        last_sign_in_at, created_at, updated_at
    ) VALUES

    (uid_uday, uid_uday,
     jsonb_build_object(
         'sub',            uid_uday::text,
         'email',          'uday.kulkarni@kletech.ac.in',
         'email_verified', true,
         'phone_verified', false
     ),
     'email',
     'uday.kulkarni@kletech.ac.in',      -- ← email as provider_id
     NOW(), NOW(), NOW()),

    (uid_narayan, uid_narayan,
     jsonb_build_object(
         'sub',            uid_narayan::text,
         'email',          'narayan.dg@kletech.ac.in',
         'email_verified', true,
         'phone_verified', false
     ),
     'email',
     'narayan.dg@kletech.ac.in',
     NOW(), NOW(), NOW()),

    (uid_vijaya, uid_vijaya,
     jsonb_build_object(
         'sub',            uid_vijaya::text,
         'email',          'vijayalaxmi.m@kletech.ac.in',
         'email_verified', true,
         'phone_verified', false
     ),
     'email',
     'vijayalaxmi.m@kletech.ac.in',
     NOW(), NOW(), NOW()),

    (uid_tewari, uid_tewari,
     jsonb_build_object(
         'sub',            uid_tewari::text,
         'email',          'tewari.pg@kletech.ac.in',
         'email_verified', true,
         'phone_verified', false
     ),
     'email',
     'tewari.pg@kletech.ac.in',
     NOW(), NOW(), NOW()),

    (uid_uma, uid_uma,
     jsonb_build_object(
         'sub',            uid_uma::text,
         'email',          'uma.mudengudi@kletech.ac.in',
         'email_verified', true,
         'phone_verified', false
     ),
     'email',
     'uma.mudengudi@kletech.ac.in',
     NOW(), NOW(), NOW())

    ON CONFLICT (provider, provider_id) DO NOTHING;


    -- ════════════════════════════════════════════════════════
    -- ria.profiles  — role-based access data
    -- ════════════════════════════════════════════════════════
    INSERT INTO ria.profiles
        (id, full_name, role_level, department_id, institute_id, dean_type, is_active)
    VALUES
    (uid_uday,    'Uday Kulkarni',  'Faculty', dept_cse_id, inst_cse_id,      NULL,             true),
    (uid_narayan, 'Narayan D G',    'HoD',     dept_cse_id, inst_cse_id,      NULL,             true),
    (uid_vijaya,  'Vijayalaxmi M',  'Dean',    NULL,         inst_cse_id,      'faculty_dean',   true),
    (uid_tewari,  'Tewari P G',     'Dean',    NULL,         inst_mech_id,     'executive_dean', true),
    (uid_uma,     'Uma Mudengudi',  'VC',      NULL,         inst_sciences_id, NULL,             true)

    ON CONFLICT (id) DO UPDATE
        SET full_name     = EXCLUDED.full_name,
            role_level    = EXCLUDED.role_level,
            department_id = EXCLUDED.department_id,
            institute_id  = EXCLUDED.institute_id,
            dean_type     = EXCLUDED.dean_type,
            updated_at    = NOW();

    RAISE NOTICE '==============================================';
    RAISE NOTICE 'SUCCESS — All 5 users ready. Login with:';
    RAISE NOTICE '  uday.kulkarni@kletech.ac.in    → /staff';
    RAISE NOTICE '  narayan.dg@kletech.ac.in        → /department';
    RAISE NOTICE '  vijayalaxmi.m@kletech.ac.in    → /faculty-dean';
    RAISE NOTICE '  tewari.pg@kletech.ac.in         → /executive-dean';
    RAISE NOTICE '  uma.mudengudi@kletech.ac.in     → /university';
    RAISE NOTICE '  Password for all: KLE@2026';
    RAISE NOTICE '==============================================';

END $$;


-- ============================================================
-- STEP 4: Verify — these run automatically after the DO block
-- ============================================================

-- Users + confirmed status
SELECT email,
       email_confirmed_at IS NOT NULL AS email_confirmed,
       created_at
FROM auth.users
WHERE email LIKE '%kletech.ac.in'
ORDER BY created_at;

-- Identities — check provider_id is EMAIL (not UUID)
SELECT u.email,
       i.provider,
       i.provider_id,
       (i.identity_data->>'email_verified')::boolean AS email_verified
FROM auth.identities i
JOIN auth.users u ON u.id = i.user_id
WHERE u.email LIKE '%kletech.ac.in'
ORDER BY u.created_at;

-- Profiles with roles
SELECT p.full_name, p.role_level, p.dean_type,
       d.name AS department, inst.name AS institute
FROM ria.profiles p
LEFT JOIN ria.departments d    ON d.id    = p.department_id
LEFT JOIN ria.institutes  inst ON inst.id = p.institute_id
WHERE p.full_name IN (
    'Uday Kulkarni','Narayan D G','Vijayalaxmi M',
    'Tewari P G','Uma Mudengudi'
)
ORDER BY p.created_at;
