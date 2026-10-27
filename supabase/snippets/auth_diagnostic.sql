-- ============================================================
-- RIA Dashboard — Auth Diagnostic Script
-- Run this in Supabase SQL Editor to diagnose login issues
-- ============================================================

-- 1. Check auth.users rows exist and are confirmed
SELECT
    email,
    aud,
    role,
    email_confirmed_at IS NOT NULL AS is_confirmed,
    encrypted_password IS NOT NULL AS has_password,
    created_at
FROM auth.users
WHERE email LIKE '%kletech.ac.in'
ORDER BY created_at;

-- 2. Check auth.identities — provider_id MUST be the email address
SELECT
    u.email,
    i.provider,
    i.provider_id,
    i.provider_id = u.email          AS provider_id_is_email,   -- must be TRUE
    (i.identity_data->>'email_verified')::boolean AS email_verified  -- must be TRUE
FROM auth.identities i
JOIN auth.users u ON u.id = i.user_id
WHERE u.email LIKE '%kletech.ac.in'
ORDER BY u.created_at;

-- 3. Check ria.profiles are linked to auth users
SELECT
    u.email,
    p.full_name,
    p.role_level,
    p.dean_type,
    p.id = u.id AS ids_match   -- must be TRUE
FROM auth.users u
LEFT JOIN ria.profiles p ON p.id = u.id
WHERE u.email LIKE '%kletech.ac.in'
ORDER BY u.created_at;

-- 4. Get the Project URL hint (instance_id used in this DB)
SELECT DISTINCT instance_id FROM auth.users LIMIT 1;
