# RIA_Publications.xlsx — Column Reference & Relationship Map

**File:** `public/RIA_Publications.xlsx`
**Sheet:** `Publications`
**Rows:** 6,516 publications
**Columns:** 50
**Period:** 1961 – 2026 (active range 2015 – 2026)

A second sheet (`Match Summary`) records the outcome of the faculty-matching pipeline:
84.8% matched (5,378 via STAFF USER ID, 147 via author name, 991 unmatched).

---

## Column Groups at a Glance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GROUP A — Identity & Authorship  (cols 1–5, 21–23, 47)                    │
│  GROUP B — Publication Metadata   (cols 6, 16–20, 24–27)                   │
│  GROUP C — Indexing & Databases   (cols 7–15)                               │
│  GROUP D — Journal Quality Metrics (cols 28–33)                             │
│  GROUP E — Identifiers            (cols 34–37, 40–41)                       │
│  GROUP F — Content                (cols 38–39)                              │
│  GROUP G — Ranking Flags          (cols 42–46)                              │
│  GROUP H — Faculty Match (appended)(cols 47–50)                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## GROUP A — Identity & Authorship

| Col | Name | Fill% | Unique | Notes |
|-----|------|-------|--------|-------|
| 1 | **PUB ID** | 100% | 6,516 | Surrogate PK; integer string (e.g. `299101`) |
| 2 | **AUTHORS** | 100% | 6,106 | Pipe `\|` or comma-separated full author list (all co-authors including external) |
| 3 | **HOME AUTHORS** | 100% | 4,252 | Semicolon-separated KLETech-affiliated authors only |
| 4 | **HOME AUTHOR DEPARTMENT** | 100% | 322 | Semicolon-separated departments of home authors (e.g. `Computer Science and Engineering;Chemistry`) |
| 5 | **HOME AUTHOR INSTITUTE** | 100% | 346 | Semicolon-separated school/institute names of home authors |
| 21 | **AUTHOR ADDRESS** | 100% | 6,244 | Pipe-separated structured address per author: `Name [UserID?], University, City, Country, School, Department` |
| 22 | **HOME AUTHOR SCHOOL** | 0% | 0 | Entirely empty — deprecated or never populated |
| 23 | **HOME AUTHOR LOCATION** | 100% | 3 | Campus of home author: `Hubballi`, `Belagavi`, `Bengaluru` (some rows have `Not Available`) |
| 47 | **STAFF USER ID** | 84.8% | 474 | Numeric faculty ID used to join to the faculty table; primary match key |

### Authorship Patterns

- **4,357 publications** (66.9%) have multiple home authors (`;` or `\|` in HOME AUTHORS)
- **1,522 publications** (23.4%) span multiple departments (`;` in HOME AUTHOR DEPARTMENT)
- AUTHOR ADDRESS encodes the [UserID] in brackets only for KLETech staff — external authors have no bracket annotation

### Relationships

```
HOME AUTHORS  ──(name match)──► STAFF USER ID ──► faculty table
HOME AUTHOR DEPARTMENT  ◄──── derived from HOME AUTHOR INSTITUTE
HOME AUTHOR LOCATION  ──────► Campus (BVB = Hubballi, Belagavi, Bengaluru)
AUTHORS  ─────────────────────► includes both home + external co-authors
AUTHOR ADDRESS  ──────────────► structured version of AUTHORS (one entry per author)
```

---

## GROUP B — Publication Metadata

| Col | Name | Fill% | Unique | Notes |
|-----|------|-------|--------|-------|
| 6 | **PUBLICATION TITLE** | 100% | 6,500 | 16 duplicate titles exist across 6,516 rows |
| 16 | **SOURCE PUBLICATION** | 100% | 2,284 | Journal/conference/book series name |
| 17 | **LEVEL** | 92.4% | 2 | `International` (4,791) or `National` (1,229) |
| 18 | **ARTICLE TYPE** | 100% | 6 | `Journal` 3,764 · `Conference` 2,357 · `Book Chapter` 295 · `PrePrint` 94 · `Book` 5 · `Working Paper` 1 |
| 19 | **YEAR** | 100% | 33 | String `"2026"` not integer; range 1961–2026; bulk in 2020–2025 |
| 20 | **MONTH** | 82.2% | 12 | Numeric month (1–12) |
| 24 | **VOL NO** | 62.9% | 546 | Volume number |
| 25 | **ISS NO** | 36.2% | 64 | Issue number |
| 26 | **B PAGE** | 88.9% | 2,275 | Begin page or article number |
| 27 | **E PAGE** | 73.3% | 1,516 | End page; absent for single-page article numbers |

### Article Type × Identifier Rules

```
ARTICLE TYPE = Journal       → ISSN populated (P_ISSN / E_ISSN)    [3,568 rows]
ARTICLE TYPE = Conference    → ISBN populated (P_ISBN / E_ISBN)    [1,722 rows]
ARTICLE TYPE = Book Chapter  → ISBN populated                       [219 rows]
PrePrint / Book / Working Paper → sparse identifiers
```

### Year Trend (2015 – 2026)

```
2015: 292   2019: 299   2023: 690
2016: 283   2020: 462   2024: 858
2017: 271   2021: 588   2025: 939
2018: 315   2022: 603   2026: 154 (partial year)
```

---

## GROUP C — Indexing & Database Flags

These columns record **where** the publication is indexed. They are not mutually exclusive — a paper can appear in Scopus (SCS), WoS (WOS), and Google Scholar (GS) simultaneously.

| Col | Name | Fill% | What it stores | Count with value |
|-----|------|-------|----------------|-----------------|
| 7 | **SCS** | 51.7% | Scopus citation count (integer) | 3,367 |
| 8 | **WOS** | 23.9% | Web of Science citation count | 1,557 |
| 9 | **SCI** | 20.1% | Flag: `YES` if SCI-listed | 1,310 |
| 10 | **PM** | 11.2% | Flag: `INDEXED` if in PubMed | 733 |
| 11 | **IEEE** | 2.2% | IEEE Xplore citation count | 142 |
| 12 | **GS** | 34.4% | Google Scholar citation count | 2,240 |
| 13 | **UGC** | 43.1% | `YES` or `YES-C` (UGC approved list) | 2,808 |
| 14 | **UGC GROUP1** | 1.0% | `YES` if in UGC Care Group 1 list | 65 |
| 15 | **ABDC** | 1.4% | ABDC journal rating: `A*`, `A`, `B`, `C` | 92 |

### Indexing Relationships

```
SCS (Scopus citations) ──drives──► Q RANK(SCS), SNIP, SJR, CiteScore
WOS (WoS citations) ────drives──► Q RANK(WOS), Impact Factor
SCI ────────────────────────────► subset of WOS-indexed journals
UGC / UGC GROUP1 ───────────────► NAAC accreditation counting
ABDC ────────────────────────────► business/management journal quality
```

- **SCS + WOS overlap**: ~1,500 papers indexed in both databases
- **SCI is a strict subset of WOS** (1,310 SCI ⊂ 1,557 WOS)
- **UGC** covers primarily National-level journals not in Scopus
- **ABDC** is sparsely populated (92 rows) — primarily Management/Business papers

---

## GROUP D — Journal Quality Metrics

All four metrics refer to the **journal** (source publication), not the individual article.

| Col | Name | Fill% | Range | Source |
|-----|------|-------|-------|--------|
| 28 | **SNIP** | 54.3% | 0.0 – ~6 | Scopus (source-normalized impact per paper) |
| 29 | **SJR** | 53.6% | 0.0 – ~25 | Scopus SCImago Journal Rank |
| 30 | **IF** | 26.3% | 0.0 – ~50 | Clarivate Impact Factor (WoS journals only) |
| 31 | **CITE SCORE** | 52.1% | 0.0 – ~100 | Scopus CiteScore |
| 32 | **Q RANK(SCS)** | 52.1% | Q1–Q4 | Scopus quartile ranking |
| 33 | **Q RANK(WOS)** | 24.8% | Q1–Q4 | WoS/JCR quartile ranking |

### Q Rank Distribution (Scopus)

| Rank | Count | % of all pubs |
|------|-------|--------------|
| Q1 | 1,127 | 17.3% |
| Q2 | 643 | 9.9% |
| Q3 | 737 | 11.3% |
| Q4 | 888 | 13.6% |
| Unranked | 3,121 | 47.9% |

### Metric Co-presence Rules

```
IF is only populated when WOS ≠ 0        (WoS journals only)
SNIP, SJR, CiteScore co-occur with SCS   (Scopus journals)
Q RANK(SCS) always co-occurs with CiteScore
Q RANK(WOS) always co-occurs with IF
```

---

## GROUP E — Identifiers

| Col | Name | Fill% | Unique | Notes |
|-----|------|-------|--------|-------|
| 34 | **P ISSN** | 64.7% | 1,252 | Print ISSN — journals and conference proceedings |
| 35 | **E ISSN** | 64.5% | 1,236 | Electronic ISSN |
| 36 | **P ISBN** | 30.3% | 845 | Print ISBN — conferences and book chapters |
| 37 | **E ISBN** | 3.5% | 121 | Electronic ISBN |
| 40 | **LINK** | 99.1% | 6,451 | Full URL (usually `https://doi.org/...`) |
| 41 | **DOI** | 83.9% | 5,460 | DOI string without prefix |

### DOI ↔ LINK Relationship

```
LINK = "https://doi.org/" + DOI    (for 5,465 rows — 83.8%)
LINK without DOI                    (992 rows — 15.2%): direct URL, no DOI registered
DOI without LINK                    (2 rows)
Neither                             (57 rows)
```

DOI is the canonical, stable identifier. LINK is derived from it but may also be a direct publisher URL when DOI is absent.

### ISSN vs ISBN by Article Type

```
ISSN (P or E)  → Journal (3,568), Conference (984), Book Chapter (103)
ISBN (P or E)  → Conference (1,722), Book Chapter (219), Book (5)
```

---

## GROUP F — Content

| Col | Name | Fill% | Unique | Notes |
|-----|------|-------|--------|-------|
| 38 | **ABSTRACT** | 74.0% | 4,810 | Full abstract text; absent for most Conference/Book entries |
| 39 | **TECHNOLOGYAREAS** | 100% | 4,083 | Comma-separated topic tags; `Not Available` for 433 rows |

### Top 10 Technology Areas

| Area | Count |
|------|-------|
| Computer Science | 2,098 |
| Engineering | 2,012 |
| Materials Science | 1,694 |
| Chemistry | 1,349 |
| Physics | 1,014 |
| Composite Material | 980 |
| Artificial Intelligence | 935 |
| Organic Chemistry | 797 |
| Mathematics | 747 |
| Biology | 696 |

TECHNOLOGYAREAS is multi-valued (comma-separated) and maps loosely to HOME AUTHOR DEPARTMENT — use it for keyword/topic analytics, not for departmental grouping.

---

## GROUP G — Ranking Flags

Boolean flags (`1` = counted for this ranking; `0` = not counted). These are **institutional** relevance flags, not individual publication quality scores.

| Col | Name | Fill% | Count=1 | Purpose |
|-----|------|-------|---------|---------|
| 42 | **NIRF** | 32.6% | 2,123 | Counted in NIRF ranking metrics |
| 43 | **NAAC** | 52.6% | 3,430 | Counted in NAAC accreditation |
| 44 | **QS** | 47.0% | 3,060 | Counted in QS World University Rankings |
| 45 | **THE** | 0% | 0 | Times Higher Education — not yet populated |
| 46 | **IsIndexed** | 96.1% | 6,263 | 1 if in any major index (Scopus/WoS/UGC/IEEE) |

### Flag Overlap Logic

```
IsIndexed = 1  ─► usually NAAC = 1, QS = 1
NIRF = 1       ─► stricter subset (Scopus/WoS only, peer-reviewed journals)
NAAC = 1       ─► broader (includes UGC, conferences)
QS = 1         ─► similar scope to NAAC
THE = 0        ─► not yet used; reserved for future THE methodology
```

---

## GROUP H — Faculty Match (Appended Columns)

These 4 columns were appended by the faculty-matching pipeline **after** the raw export from Scopus/WoS. They link publications back to the faculty master list.

| Col | Name | Fill% | Unique | Notes |
|-----|------|-------|--------|-------|
| 47 | **STAFF USER ID** | 84.8% | 474 | KLETech faculty ID — FK to `faculty.user_id`; present when match succeeded |
| 48 | **MATCHED INSTITUTE** | 84.8% | 18 | Institute name resolved during matching (e.g. `School of Mechanical Engineering`) |
| 49 | **MATCHED DEPARTMENT** | 84.8% | 27 | Department resolved during matching (canonical, not raw HOME AUTHOR DEPARTMENT) |
| 50 | **MATCH SOURCE** | 100% | 3 | `USERID` · `NAME` · `UNMATCHED` |

### Match Source Breakdown

| Source | Count | % | How |
|--------|-------|---|-----|
| USERID | 5,378 | 82.5% | `[UserID]` bracket found in AUTHOR ADDRESS |
| NAME | 147 | 2.3% | Author name string matched to faculty table |
| UNMATCHED | 991 | 15.2% | No match found — external-only or missing ID |

### HOME AUTHOR DEPARTMENT vs MATCHED DEPARTMENT

```
HOME AUTHOR DEPARTMENT  ─► raw, pipe-delimited, from original data export
                             may have typos, aliases, multiple depts per row
MATCHED DEPARTMENT      ─► canonical dept name resolved during matching
                             single value, FK-safe for grouping/charts
```

For grouping publications by department in dashboards, use **MATCHED DEPARTMENT** (col 49), not HOME AUTHOR DEPARTMENT (col 4).

---

## Complete Relationship Map

```
                    ┌──────────────────────────────────────────────────────┐
                    │            PUBLICATION (PUB ID = PK)                │
                    │                                                      │
  AUTHORSHIP        │  AUTHORS ────────────────────────────────────────── │──► external co-authors
  ─────────         │  HOME AUTHORS ──────┐                               │
                    │  HOME AUTHOR DEPT ──┤──► multi-valued, raw          │
                    │  HOME AUTHOR INST ──┘                               │
                    │  AUTHOR ADDRESS ─────────────────────────────────── │──► [UserID] brackets
                    │  HOME AUTHOR LOCATION ──────────────────────────── │──► Campus (BVB/Belagavi/Bengaluru)
                    │  STAFF USER ID ─────────────────────────────────── │──► Faculty Table (FK)
                    │  MATCHED INSTITUTE ─────────────────────────────── │──► canonical institute
                    │  MATCHED DEPARTMENT ────────────────────────────── │──► canonical dept (use this!)
                    │  MATCH SOURCE ──────────────────────────────────── │──► USERID / NAME / UNMATCHED
                    │                                                      │
  METADATA          │  PUBLICATION TITLE                                  │
  ────────          │  SOURCE PUBLICATION ────────────────────────────── │──► journal / conf / series
                    │  ARTICLE TYPE ──────────────────────────────────── │──► Journal / Conference / Book Chapter / ...
                    │  LEVEL ─────────────────────────────────────────── │──► International / National
                    │  YEAR, MONTH                                        │
                    │  VOL NO, ISS NO, B PAGE, E PAGE                    │
                    │                                                      │
  INDEXING          │  SCS (Scopus citations) ───────────────────────── │──► drives Q RANK(SCS), SNIP, SJR, CiteScore
  ────────          │  WOS (WoS citations) ──────────────────────────── │──► drives Q RANK(WOS), IF
                    │  SCI ──────────────────────────────────────────── │──► subset of WOS
                    │  GS (Google Scholar)                               │
                    │  PM (PubMed)                                        │
                    │  IEEE                                               │
                    │  UGC, UGC GROUP1 ──────────────────────────────── │──► NAAC counting
                    │  ABDC ─────────────────────────────────────────── │──► management journal quality
                    │  IsIndexed ─────────────────────────────────────  │──► any of above = 1
                    │                                                      │
  QUALITY           │  SNIP, SJR, CiteScore ─────────────────────────── │──► Scopus-based (SCS ≠ 0)
  METRICS           │  IF (Impact Factor) ───────────────────────────── │──► WoS-based (WOS ≠ 0)
                    │  Q RANK(SCS) ───────────────────────────────────── │──► Q1/Q2/Q3/Q4 (Scopus)
                    │  Q RANK(WOS) ───────────────────────────────────── │──► Q1/Q2/Q3/Q4 (WoS/JCR)
                    │                                                      │
  IDENTIFIERS       │  P ISSN / E ISSN ──────────────────────────────── │──► journals & conferences (ISSN)
                    │  P ISBN / E ISBN ──────────────────────────────── │──► conferences & books (ISBN)
                    │  DOI ───────────────────────────────────────────── │──► stable identifier
                    │  LINK = "https://doi.org/" + DOI (83.8% of rows)  │
                    │                                                      │
  CONTENT           │  ABSTRACT                                           │
                    │  TECHNOLOGYAREAS ───────────────────────────────── │──► comma-separated topic tags
                    │                                                      │
  RANKING           │  NIRF ──────────────────────────────────────────── │──► NIRF scoring subset
  FLAGS             │  NAAC ──────────────────────────────────────────── │──► NAAC accreditation
                    │  QS ────────────────────────────────────────────── │──► QS ranking subset
                    │  THE ────────────────────────────────────────────── │──► (empty, reserved)
                    └──────────────────────────────────────────────────────┘
```

---

## Data Quality Notes

| Issue | Detail |
|-------|--------|
| HOME AUTHOR SCHOOL (col 22) | 100% empty — do not use |
| THE (col 45) | 100% empty — reserved for future |
| YEAR is a string | Stored as `"2026"` not integer — parse before sorting |
| HOME AUTHOR LOCATION dirty | Mostly `Hubballi` (6,514), but `Hubali` (1) and `Not Available` (1) exist |
| Multi-valued columns | HOME AUTHORS, HOME AUTHOR DEPT, HOME AUTHOR INST use `;` separator; AUTHORS uses `\|` |
| ABDC has trailing spaces | `"A "`, `"C "`, `"B "` — trim before comparing |
| 991 unmatched pubs (15.2%) | External-only papers or old records before user ID system; HOME AUTHOR DEPT is the only department signal |
| 16 duplicate titles | Different PUB IDs — check DOI to confirm if truly different publications |

---

## Column → Use Case Quick Reference

| Use Case | Columns to Use |
|----------|---------------|
| Group by campus | HOME AUTHOR LOCATION (col 23) |
| Group by department | MATCHED DEPARTMENT (col 49), fallback: HOME AUTHOR DEPT (col 4) |
| Count pubs by year | YEAR (col 19) — cast to int |
| Quality filter (high-impact) | Q RANK(SCS) = Q1, or IF > threshold, or CiteScore > threshold |
| NIRF reporting | NIRF = 1 AND ARTICLE TYPE = Journal AND (SCS > 0 OR WOS > 0) |
| NAAC reporting | NAAC = 1 |
| Citation metrics | SCS (Scopus), WOS (Web of Science), GS (Google Scholar) |
| Faculty join | STAFF USER ID → faculty.user_id (84.8% match rate) |
| Open URL | LINK (99.1% populated), fallback: "https://doi.org/" + DOI |
| Topic analysis | TECHNOLOGYAREAS (100% populated, comma-split) |
| Journal reputation | SNIP, SJR, CiteScore (Scopus); IF (WoS) |
