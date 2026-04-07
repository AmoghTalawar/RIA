-- ============================================================
--  Step 1: Get the UUIDs you need
--  Run this first, copy the values, then do Step 2
-- ============================================================

-- Get department + institute UUIDs
-- (We'll assign test users to Chemistry dept / Department of Chemistry)
SELECT
    d.id   AS department_id,
    d.name AS department_name,
    i.id   AS institute_id,
    i.name AS institute_name
FROM   public.departments d
JOIN   public.institutes  i ON i.id = d.institute_id
WHERE  d.name = 'Computer Science and Engineering'
  AND  i.name = 'School of Computer Science and Engineering';

-- Get a real faculty UUID to link sunil@faculty.com
-- (Using ria_user_id 233046 — Tejraj Aminabhavi, Chemistry dept)
SELECT id AS faculty_uuid, ria_user_id, author_name
FROM   public.faculty
WHERE  ria_user_id = 232727;



-- ============================================================
--  Step 2: Insert profiles for all 4 users
--  Replace <dept_uuid> and <inst_uuid> with values from above
-- ============================================================

-- ── 1. sunil@faculty.com → Faculty ──────────────────────────
INSERT INTO public.profiles
    (id, ria_user_id, full_name, role_level, department_id, institute_id, faculty_id)
VALUES (
    '18c1a08a-1d69-406a-8692-d2ce46d854f2',
    232730,
    'Uday Faculty',
    'Faculty',
    '4e1a2fef-aae7-4dd9-98ae-acd8b63ed966',
    '7402dad5-ad41-41bb-99ab-91abebee2c7c',
    '46db26c7-69d1-436e-8e6a-3003693dcbb2'
)
ON CONFLICT (id) DO UPDATE SET
    ria_user_id   = EXCLUDED.ria_user_id,
    full_name     = EXCLUDED.full_name,
    role_level    = EXCLUDED.role_level,
    department_id = EXCLUDED.department_id,
    institute_id  = EXCLUDED.institute_id,
    faculty_id    = EXCLUDED.faculty_id,
    updated_at    = NOW();

-- ── 2. narayan@hod.com → HoD ────────────────────────────────
INSERT INTO public.profiles
    (id, full_name, role_level, department_id, institute_id)
VALUES (
    '80a79399-2d95-4199-9610-888f78d43b00',  -- narayan@hod.com
    'Narayan HoD',
    'HoD',
    '4e1a2fef-aae7-4dd9-98ae-acd8b63ed966',    -- same  dept UUID
    '7402dad5-ad41-41bb-99ab-91abebee2c7c'     -- same institute UUID
)
ON CONFLICT (id) DO UPDATE SET
    ria_user_id   = EXCLUDED.ria_user_id,
    full_name     = EXCLUDED.full_name,
    role_level    = EXCLUDED.role_level,
    department_id = EXCLUDED.department_id,
    institute_id  = EXCLUDED.institute_id,
    faculty_id    = EXCLUDED.faculty_id,
    updated_at    = NOW();


-- ── 3. uma@dean.com → Dean ──────────────────────────────────
INSERT INTO public.profiles
    (id, full_name, role_level, institute_id)
VALUES (
    '5381fcfb-0fda-4206-ba94-a8624a7e8331',  -- uma@dean.com
    'Uma Dean',
    'Dean',
    '7402dad5-ad41-41bb-99ab-91abebee2c7c'     -- same institute UUID — no dept needed for Dean
)
ON CONFLICT (id) DO UPDATE SET
    ria_user_id   = EXCLUDED.ria_user_id,
    full_name     = EXCLUDED.full_name,
    role_level    = EXCLUDED.role_level,
    department_id = EXCLUDED.department_id,
    institute_id  = EXCLUDED.institute_id,
    faculty_id    = EXCLUDED.faculty_id,
    updated_at    = NOW();


-- ── 4. ashok@vc.com → VC ─────────────────────────────────────
INSERT INTO public.profiles
    (id, full_name, role_level)
VALUES (
    'eacb5d41-a806-4034-9ef0-7a71ad12121e',  -- ashoky@vc.com
    'Ashok VC',
    'VC'              -- no dept or institute needed
)
ON CONFLICT (id) DO UPDATE SET
    ria_user_id   = EXCLUDED.ria_user_id,
    full_name     = EXCLUDED.full_name,
    role_level    = EXCLUDED.role_level,
    department_id = EXCLUDED.department_id,
    institute_id  = EXCLUDED.institute_id,
    faculty_id    = EXCLUDED.faculty_id,
    updated_at    = NOW();


-- ============================================================
--  Step 3: Verify all 4 profiles look correct
-- ============================================================

SELECT
    u.email,
    p.role_level,
    p.full_name,
    d.name  AS department,
    i.name  AS institute,
    f.author_name AS linked_faculty
FROM      public.profiles    p
JOIN      auth.users         u ON u.id  = p.id
LEFT JOIN public.departments d ON d.id  = p.department_id
LEFT JOIN public.institutes  i ON i.id  = p.institute_id
LEFT JOIN public.faculty     f ON f.id  = p.faculty_id
ORDER BY  p.role_level;