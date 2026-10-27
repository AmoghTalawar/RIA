-- ============================================================
-- CLEANUP: Remove users inserted via broken raw SQL
-- Run this in Supabase SQL Editor BEFORE running the Node script
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
            DELETE FROM auth.sessions   WHERE user_id = uid;
            DELETE FROM auth.identities WHERE user_id = uid;
            DELETE FROM ria.profiles    WHERE id = uid;
            DELETE FROM auth.users      WHERE id = uid;
            RAISE NOTICE 'Removed: %', em;
        ELSE
            RAISE NOTICE 'Not found (ok): %', em;
        END IF;
    END LOOP;
    RAISE NOTICE 'Cleanup complete. Now run: node scripts/create_auth_users.mjs';
END $$;

-- Verify cleanup
SELECT email FROM auth.users WHERE email LIKE '%kletech.ac.in';
-- Should return 0 rows
