-- ── Test 1: Faculty (sunil) — should see only OWN faculty row ──
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "201a3801-c429-423d-a438-b13a049954d4", "role": "authenticated"}';

SELECT id, author_name, department_id FROM public.faculty;
-- Expected: 1 row (Sunil Gurlahosur V only)


-- ── Test 2: HoD (narayan) — should see ALL faculty in CSE dept ──
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "80a79399-2d95-4199-9610-888f78d43b00", "role": "authenticated"}';

SELECT id, author_name FROM public.faculty;
-- Expected: multiple rows (everyone in Computer Science and Engineering)


-- ── Test 3: Dean (uma) — should see ALL faculty in CSE institute ──
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "5381fcfb-0fda-4206-ba94-a8624a7e8331", "role": "authenticated"}';

SELECT id, author_name FROM public.faculty;
-- Expected: more rows than HoD (all depts under School of CSE)


-- ── Test 4: VC (ashok) — should see ALL 739 faculty ──
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "c9640654-9488-491c-8fc3-7312b97832b3", "role": "authenticated"}';

SELECT COUNT(*) FROM public.faculty;
-- Expected: 739