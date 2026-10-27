# RIA Migration V2: Taxonomy Rebuild & Data Population Guide

This folder contains the complete migration and dataset reload scripts for the updated taxonomy (8 Institutes, 42 Departments) and clean data population from the Excel datasets.

---

## 📁 Files in this Folder

1. **`01_rebuild_taxonomy_and_truncate.sql`**:
   - Safely detaches `ria.profiles` foreign keys without deleting user accounts.
   - Truncates data tables (`faculty_publications`, `publications`, `faculty`, `departments`, `institutes`).
   - Reseeds the restructured 8 institutes and 42 departments.
   - Widens bounded `VARCHAR` columns to `TEXT` (to handle long titles, affiliations, DOIs).
   - Grants permissions for `anon`, `authenticated`, and `service_role` on the `ria` schema.
   - Re-attaches foreign keys on `ria.profiles`.

2. **`02_populate_ria.py`**:
   - Populates `ria.faculty` (739 rows) from `FACULTY COMPARE.xlsx`.
   - Populates `ria.publications` (7,061 rows) from `Pub_Mine_export_cleaned_v3.xlsx`.
   - Normalizes author separators (`;` -> `|`) and guards against placeholder dates (`9999-01-01`).
   - Paginates all publication and faculty UUIDs from Supabase to correctly build the full junction table `ria.faculty_publications` (9,619 rows).

3. **`FACULTY COMPARE.xlsx`**: Faculty roster dataset (739 rows).
4. **`Pub_Mine_export_cleaned_v3.xlsx`**: Cleaned publications dataset (7,061 rows).

---

## 🚀 Step-by-Step Instructions

### Step 1: Ensure `ria` schema is exposed in `supabase/config.toml`
In your Supabase project's `supabase/config.toml`:
```toml
[api]
schemas = ["public", "graphql_public", "ria"]
extra_search_path = ["public", "extensions", "ria"]
```
If you edited `config.toml`, restart local Supabase:
```powershell
npx supabase stop
npx supabase start
```

---

### Step 2: Run the SQL Migration
Execute `01_rebuild_taxonomy_and_truncate.sql` in **Supabase Studio SQL Editor** ([http://127.0.0.1:54323](http://127.0.0.1:54323)) or via `psql`:
```powershell
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f 01_rebuild_taxonomy_and_truncate.sql
```

---

### Step 3: Run the Python Data Population Script
Set your Supabase credentials (use `service_role` secret key):

```powershell
# Set Environment Variables
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_SERVICE_KEY="<YOUR_SERVICE_ROLE_KEY>"

# Run Population
python 02_populate_ria.py --faculty "FACULTY COMPARE.xlsx" --pubs "Pub_Mine_export_cleaned_v3.xlsx"
```

---

## ✅ Expected Verification Counts

| Table | Expected Count |
| :--- | :--- |
| `ria.institutes` | **8** |
| `ria.departments` | **42** |
| `ria.faculty` | **739** |
| `ria.publications` | **7,061** |
| `ria.faculty_publications` | **9,619** |
