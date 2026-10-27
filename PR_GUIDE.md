# How to Push Code and Submit a PR

## 1. The Golden Rule
**Never push directly to `production`.** Always create a new branch and open a Pull Request (PR) for review by Saiprasad.

## 2. Current Pending Changes
You are currently making a database switch from Excel-based data loading to Supabase. Make sure these changes are included:
* **Deleted:** `src/data/excelDataLoader.js`
* **Added:** `src/data/supabaseDataLoader.js`
* **Added Migration:** `supabase/migrations/20250101000003_static_data_tables.sql`
* **Modified:** `PublicationExplorer.jsx` & `UniversityDeanDashboard.jsx`

## 3. Step-by-step Git Workflow

Run these commands in your terminal (inside the `RIA-Dashboard` folder):

### Step 1: Create a new branch
Use the format `intern/yourname-feature-name` as required by the contribution guidelines. (Replace `yourname` with your actual name)

```bash
git checkout -b intern/yourname-supabase-data-loader
```

### Step 2: Stage and Commit your changes
```bash
git add .
git commit -m "feat: switch from excel to supabase data loading and add static data tables migration"
```

### Step 3: Push the branch
```bash
git push -u origin intern/yourname-supabase-data-loader
```

### Step 4: Open the Pull Request
1. Go to the repository URL in your browser.
2. Click the **"Compare & pull request"** button for your newly pushed branch.
3. In the PR description, explicitly mention:
   * Removal of the Excel loader.
   * Addition of the new Supabase loader.
   * Creation of the `20250101000003_static_data_tables.sql` migration file.
4. **Submit the PR.**
5. Wait for your lead (Saiprasad) to review and merge it. Do not merge it yourself.
