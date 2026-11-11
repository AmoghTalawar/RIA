-- Link the Faculty Dean and Executive Dean demo accounts to their own faculty (research) records,
-- like the Faculty, HoD and VC accounts already are. Without the link, "my publications / my citations"
-- cannot be answered and the dean has no profile page. Idempotent; matches on the profile's full_name.
UPDATE ria.profiles p
SET ria_user_id = f.ria_user_id,
    faculty_id  = f.id,
    updated_at  = NOW()
FROM ria.faculty f
WHERE (p.full_name = 'Vijayalaxmi M' AND f.ria_user_id = 232696)   -- Vijayalakshmi M, School of CSE
   OR (p.full_name = 'Tewari P G'    AND f.ria_user_id = 232858);  -- Tewari P G, Mechanical Engineering
