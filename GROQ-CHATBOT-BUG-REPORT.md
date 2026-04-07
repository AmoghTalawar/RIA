# RIA-Dashboard: Groq Chatbot Bug Correction Report

**Date:** 2026-03-28
**Prepared for:** Interns (RIA team)
**Branch:** `L1-Interface(ChatBot)`
**Comparison baseline:** FIA-Dashboard-v2 (`feature/full-budget-hierarchy`)

---

## Executive Summary

Both RIA chatbots have **JavaScript string escaping bugs** that silently break regex matching, plus **hard caps on publication counts** that cause the AI to give wrong answers. These are not Groq model limitations — they are bugs in the code that sends data to Groq.

**FIA-Dashboard-v2 does not have these bugs** because it pre-computes exact counts in `budget_data.json` and injects them as facts. RIA sends raw records and asks the LLM to count — which breaks when the code silently drops records.

---

## File 1: `src/components/AIChatbot.jsx` (University Dashboard Chatbot)

### Bug 1: Double-Escaped Regex — Faculty Name Split (Line 170)

**Broken code:**
```javascript
f.name.toLowerCase().split(/[\\s.]+/)
```

**What happens:** In a JSX/JS file, `\\s` inside a regex literal `/[\\s.]+/` means literal backslash + `s`, NOT a whitespace character. The regex should be `/[\s.]+/`. Result: faculty names like `"Dr. Raj Kumar"` are never split into tokens — the whole string stays as one token, so individual name parts (`Raj`, `Kumar`) are never searched.

**Fix:**
```javascript
f.name.toLowerCase().split(/[\s.]+/)
```

---

### Bug 2: Double-Escaped Regex — Year Match (Line 182)

**Broken code:**
```javascript
const yearMatch = q.match(/\\b(20[12]\\d)\\b/);
```

**What happens:** Same issue. `\\b` in a regex literal is literal backslash + `b`, not a word boundary. `\\d` is literal backslash + `d`, not a digit. This regex **never matches any year**. So when a user asks "How many papers did Dr. X publish in 2023?", the year filter is never applied — all years are returned, and the AI gives a wrong count.

**Fix:**
```javascript
const yearMatch = q.match(/\b(20[12]\d)\b/);
```

**Note:** `PublicationExplorer.jsx` line 458 has the correct version: `q.match(/\b(20[0-2]\d)\b/)` — copy that pattern.

---

### Bug 3: Double-Escaped Join — Publication List (Line 203)

**Broken code:**
```javascript
}).join('\\n');
```

**What happens:** `'\\n'` in a JS string is a literal two-character sequence backslash + `n`, NOT a newline. All 50 publication records get concatenated into one unreadable line. The LLM receives a wall of text instead of structured per-line records, making counting and parsing unreliable.

**Fix:**
```javascript
}).join('\n');
```

---

### Bug 4: 3-Character Substring Matching — Too Loose (Line 149)

**Broken code:**
```javascript
return queryWords.some(w => w.length >= 3 && fName.includes(w));
```

**What happens:** A 3-character substring match is too loose. Query word `"raj"` matches `"Rajesh"`, `"Rajendra"`, `"Rajiv"`, `"Neeraj"`, `"Braj"`, etc. User asks about one faculty member, gets publications from 10 different people mixed together.

**Fix — raise minimum to 4 characters and prefer word-boundary matching:**
```javascript
return queryWords.some(w => {
  if (w.length < 4) return false;
  // Prefer word-start match to avoid substring false positives
  return fName.includes(w) && (
    fName.startsWith(w) ||
    fName.includes(' ' + w) ||
    fName.includes('.' + w)
  );
});
```

**Alternative (simpler):** Just change `3` to `4`:
```javascript
return queryWords.some(w => w.length >= 4 && fName.includes(w));
```

---

### Bug 5: Hard Cap of 50 Publications (Line 191)

**Broken code:**
```javascript
const limited = pubsToShow.slice(0, 50);
```

**What happens:** If a faculty member has 200 publications, only the first 50 are sent to Groq. The AI then says "Dr. X has 50 publications" — which is wrong. The user sees the note "(50 of 200)" but the AI model does NOT understand that disclaimer.

**Root cause:** This is the real Groq context limitation workaround. Groq's `llama-3.3-70b-versatile` has a ~32K token context window. Sending 200 full publication records (title + journal + year + authors + Q-rank each) would exceed the token budget.

**Fix — Pre-aggregate counts, send summary + sample:**
```javascript
// Send exact count as a FACT the LLM can cite
extra += `\n=== PUBLICATION SUMMARY FOR MATCHED AUTHORS ===\n`;
extra += `Total publications found: ${pubsToShow.length}\n`;

// Group by year for year-wise counts
const yearCounts = {};
pubsToShow.forEach(p => {
  const y = p['YEAR'] || 'Unknown';
  yearCounts[y] = (yearCounts[y] || 0) + 1;
});
extra += `Year-wise: ${Object.entries(yearCounts).sort((a,b) => b[0]-a[0]).map(([y,c]) => `${y}:${c}`).join(', ')}\n`;

// Group by Q-rank
const qCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
pubsToShow.forEach(p => {
  const qr = ((p['Q RANK(SCS)'] || '') + '').trim().toUpperCase();
  if (qr === 'Q1') qCounts.Q1++;
  else if (qr === 'Q2') qCounts.Q2++;
  else if (qr === 'Q3') qCounts.Q3++;
  else if (qr === 'Q4') qCounts.Q4++;
  else qCounts.Unranked++;
});
extra += `Q-rank: Q1:${qCounts.Q1}, Q2:${qCounts.Q2}, Q3:${qCounts.Q3}, Q4:${qCounts.Q4}, Unranked:${qCounts.Unranked}\n`;

// Then send a SAMPLE of records (not all)
const limited = pubsToShow.slice(0, 30);
extra += `\n=== SAMPLE PUBLICATIONS (${limited.length} of ${pubsToShow.length}) ===\n`;
```

**This is how FIA-Dashboard-v2 solves it** — see comparison section below.

---

## File 2: `src/pages/PublicationExplorer.jsx` (Publication Explorer Chatbot)

### Bug 6: Hard Cap of 40 Publications (Line 486)

**Broken code:**
```javascript
const limited = filtered.slice(0, 40);
```

**Same issue as Bug 5** but with a 40-record cap. Less severe because PublicationExplorer already has a department breakdown summary (lines 501-508) that partially compensates. But the LLM still gets wrong totals.

**Fix:** Same pre-aggregation approach as Bug 5. Add total count, year-wise breakdown, and Q-rank breakdown BEFORE the sample records.

### Bug 7: No Pre-Aggregation for Count Queries (Architectural)

When users ask "How many Q1 papers does CSE have?", the code:
1. Searches 6,500 publications for keyword "CSE"
2. Sends 40 raw records to Groq
3. Asks the LLM to count them

This is fragile. The LLM may miscount, and 40 may not be all of them.

**Fix:** Pre-compute the answer and inject it as a fact:
```javascript
// After filtering, compute exact counts BEFORE slicing
const totalMatched = filtered.length;
const q1Count = filtered.filter(p => (p['Q RANK(SCS)'] || '').trim().toUpperCase() === 'Q1').length;
extra += `\nExact count: ${totalMatched} publications matched. Q1: ${q1Count}.\n`;
```

---

## How FIA-Dashboard-v2 Solves This Correctly

FIA v2's approach (`L1Analytics.jsx` lines 325-341):

```javascript
// Pre-computed in budget_data.json by Python parser:
// hierarchy.department_revenue = { "Electronics & Comm": 386600000, "Computer Science": 308000000, ... }

const sorted = Object.entries(hierarchy.department_revenue).sort((a, b) => b[1] - a[1]);
sorted.forEach(([dept, amount]) => {
  deptRevCtx += `- ${dept}: ₹${Number(amount).toLocaleString('en-IN')} (${(amount/10000000).toFixed(2)} Cr)\n`;
});
```

**Key difference:** The Python parser (`budget_parser.py`) pre-computes exact department revenue figures. The AI system prompt receives:

```
## UG ENGINEERING DEPARTMENT REVENUE (from Annexure J):
- Electronics & Comm: ₹38,66,00,000 (38.66 Cr)
- Computer Science: ₹30,80,00,000 (30.80 Cr)
- CS(AI): ₹18,84,00,000 (18.84 Cr)
...
```

The LLM doesn't need to count anything — it reads pre-computed facts. This is why FIA correctly answers "ECE earned the highest department revenue" while RIA gives wrong/partial answers.

---

## Summary: All Bugs at a Glance

| # | File | Line | Bug | Severity | Fix Effort |
|---|------|------|-----|----------|------------|
| 1 | AIChatbot.jsx | 170 | `\\s` in regex literal → name split broken | **HIGH** | 1 min — remove extra backslash |
| 2 | AIChatbot.jsx | 182 | `\\b`, `\\d` in regex literal → year filter broken | **HIGH** | 1 min — remove extra backslashes |
| 3 | AIChatbot.jsx | 203 | `'\\n'` join → all pubs on one line | **HIGH** | 1 min — change to `'\n'` |
| 4 | AIChatbot.jsx | 149 | 3-char substring match → false positives | **MEDIUM** | 5 min — raise to 4, add word-boundary |
| 5 | AIChatbot.jsx | 191 | Hard cap 50 → wrong pub counts | **HIGH** | 20 min — add pre-aggregation |
| 6 | PublicationExplorer.jsx | 486 | Hard cap 40 → wrong pub counts | **MEDIUM** | 20 min — add pre-aggregation |
| 7 | PublicationExplorer.jsx | (arch) | No pre-aggregation for count queries | **MEDIUM** | 30 min — compute counts before sending |

**Bugs 1-3 are one-line fixes** that should be done immediately — they make every faculty-specific query return wrong results.

**Bugs 5-7 require the FIA-v2 pattern:** pre-compute exact counts and inject them as facts into the system prompt, then send only a sample of raw records for the LLM to reference.

---

## Recommended Fix Order

1. **Fix Bugs 1, 2, 3 first** (5 minutes total) — these are typos that break everything
2. **Fix Bug 4** (5 minutes) — reduces false positive matches
3. **Fix Bugs 5 + 6 together** (30 minutes) — add pre-aggregation to both chatbots
4. **Fix Bug 7** (30 minutes) — architectural improvement, compute counts server-side

After fixing 1-3, test with: *"List all publications by Dr. [name] in 2023"* — should now correctly filter by year and show each pub on its own line.

After fixing 5-7, test with: *"How many publications does [dept] have?"* — should return exact count, not capped at 40/50.

---

## Part 2: Variable Data Parsing Pipeline — How Data Flows Into Groq

This section explains the complete data flow from Excel file to Groq prompt in both chatbots, and identifies structural/architectural issues in how variables are parsed, constructed, and injected.

---

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  /public/RIA_Publications.xlsx  (6,516 rows × 50 columns)      │
│  /public/FACULTY COMPARE (2).xlsx (739 rows × 36 columns)      │
└───────────────────────┬─────────────────────────────────────────┘
                        │ SheetJS (xlsx) — client-side parse
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  excelDataLoader.js                                             │
│  loadExcelData() → raw JS arrays                                │
│  aggregateUniversityData() → KPIs, targets, Q-rank, top faculty │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────────┐
│ AIChatbot.jsx        │   │ PublicationExplorer.jsx               │
│                      │   │                                       │
│ Props received:      │   │ Props received:                       │
│  contextData = {     │   │  publications (6,516 raw records)     │
│    allFaculty,       │   │  deptStats (pre-aggregated by dept)   │
│    rawPublications,  │   │  campusStats (BVB/Belagavi/Bengaluru) │
│    universityKPIs,   │   │  yearStack (year × Q-rank counts)     │
│    topUniversityFac, │   │                                       │
│    pubsByYearSummary │   │                                       │
│    ...12 more fields │   │                                       │
│  }                   │   │                                       │
└──────┬───────────────┘   └──────┬────────────────────────────────┘
       │                          │
       ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────────┐
│ STEP 1: Build index  │   │ STEP 1: Build base context           │
│ facultyIndex = 739   │   │ baseContext ≈ 2K tokens               │
│ entries with name,   │   │ Pre-aggregated: Q-rank totals,        │
│ dept, pubs, cit, h   │   │ top 15 depts, top 15 journals,        │
│                      │   │ article types, indexing counts,        │
│ rawPubsRef = 6,516   │   │ year-wise totals, campus counts       │
│ raw records in ref   │   │                                       │
└──────┬───────────────┘   └──────┬────────────────────────────────┘
       │                          │
       ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────────┐
│ STEP 2: Base context │   │ STEP 2: Dynamic query context        │
│ baseContext ≈ 3K tok │   │ Per query: search 6,516 pubs by      │
│ KPIs, targets, year  │   │ keyword → filter by year → filter    │
│ pubs, campus, Q-rank │   │ by Q-rank → SLICE TO 40 → format    │
│ top 10 faculty, NIRF │   │ + dept breakdown of matches          │
│ peers, funding, PhD  │   │                                       │
└──────┬───────────────┘   └──────┬────────────────────────────────┘
       │                          │
       ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────────┐
│ STEP 3: Dynamic ctx  │   │ STEP 3: System prompt assembly       │
│ Per query:           │   │ systemInstruction =                   │
│ - Search faculty by  │   │   role description                    │
│   name (BUG 1,4)     │   │   + baseContext (2K tokens)           │
│ - Search rawPubs by  │   │   + queryContext (≤40 records)        │
│   author tokens      │   │   + rules (9 items)                   │
│   (BUG 1: split fail)│   │                                       │
│ - Year filter (BUG2) │   │ Total: ~4-6K tokens                   │
│ - SLICE TO 50        │   │                                       │
│   (BUG 5)            │   │                                       │
│ - Join with \\n       │   │                                       │
│   (BUG 3)            │   │                                       │
└──────┬───────────────┘   └──────┬────────────────────────────────┘
       │                          │
       ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ GROQ API: llama-3.3-70b-versatile                               │
│ system: [role + baseContext + queryContext + rules]              │
│ user: [original query text]                                     │
│ temperature: 0.1, max_tokens: 2048                              │
│ Context window: ~32K tokens (≈24K words)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

### Issue 8: AIChatbot — `contextData` Prop Dependency (Structural)

**File:** `AIChatbot.jsx` lines 6, 45-64

**How it works:** AIChatbot receives ALL data as a single `contextData` prop from the parent page (UniversityDeanDashboard). It destructures:

```javascript
// Line 48-50
const allFaculty = contextData.allFaculty || [];           // 739 faculty records
const rawPublications = contextData.rawPublications || []; // 6,516 publication records
rawPubsRef.current = rawPublications;                      // stored in ref for query-time search
```

**Problem:** The chatbot holds **6,516 raw publication objects in a `useRef`** — each with 50 columns. That's ~10MB of raw Excel data sitting in browser memory, re-searched on every single query using substring matching.

**FIA v2 comparison:** FIA's `budget_data.json` is 37KB — a Python parser pre-computes all hierarchy data offline. The React app never touches the raw Excel.

**Fix approach:**
```
Option A (quick): Keep raw pubs in ref, but pre-compute per-faculty pub counts
         in the useMemo that builds facultyIndex (line 45-64)
Option B (proper): Build a pre-aggregated JSON file (like FIA's budget_data.json)
         from the Excel data at build time, not at runtime
```

---

### Issue 9: AIChatbot — Faculty Index Missing Publication Counts by Year/Q-Rank (Line 53-61)

**Current faculty index structure:**
```javascript
// Line 53-61
const fIndex = allFaculty.map(f => ({
  name: f['AUTHOR NAME'] || 'Unknown',
  dept: f['DEPARTMENT'] || f['INSTITUTE'] || 'N/A',
  totalPubs: Number(f['TOTAL PUBLICATIONS'] || 0),
  scopusCitations: Number(f['SCOPUS CITATIONS'] || 0),
  hIndex: Number(f['SCOPUS H-INDEX'] || 0),
  q1: Number(f['SCOPUS Q1 COUNT'] || 0),
  q2: Number(f['SCOPUS Q2 COUNT'] || 0),
}));
```

**What's missing:** The index has `totalPubs` and `q1`/`q2` from the Faculty Excel, but NO year-wise breakdown. When someone asks "How many papers did Dr. X publish in 2023?", the code can't answer from the index — it has to fall back to searching 6,516 raw publication records by author name substring (which is broken by Bugs 1-3).

**Fix — Enrich the faculty index with year-wise counts from raw publications:**
```javascript
const fIndex = allFaculty.map(f => {
  const name = f['AUTHOR NAME'] || 'Unknown';
  const nameTokens = name.toLowerCase().split(/[\s.]+/).filter(w => w.length >= 4);

  // Pre-compute this faculty's publication breakdown from raw data
  const myPubs = rawPublications.filter(p => {
    const authors = ((p['HOME AUTHORS'] || '') + '').toLowerCase();
    return nameTokens.some(token => authors.includes(token));
  });

  // Year-wise counts
  const byYear = {};
  const byQRank = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
  myPubs.forEach(p => {
    const y = p['YEAR'] || 'Unknown';
    byYear[y] = (byYear[y] || 0) + 1;
    const qr = ((p['Q RANK(SCS)'] || '') + '').trim().toUpperCase();
    if (byQRank[qr] !== undefined) byQRank[qr]++;
    else byQRank.Unranked++;
  });

  return {
    name,
    dept: f['DEPARTMENT'] || f['INSTITUTE'] || 'N/A',
    totalPubs: Number(f['TOTAL PUBLICATIONS'] || 0),
    matchedPubs: myPubs.length,  // actual count from publication data
    scopusCitations: Number(f['SCOPUS CITATIONS'] || 0),
    hIndex: Number(f['SCOPUS H-INDEX'] || 0),
    q1: Number(f['SCOPUS Q1 COUNT'] || 0),
    q2: Number(f['SCOPUS Q2 COUNT'] || 0),
    byYear,     // { "2023": 5, "2022": 8, ... }
    byQRank,    // { Q1: 3, Q2: 2, Q3: 1, Q4: 0, Unranked: 2 }
  };
});
```

Then in `buildQueryContext`, inject the pre-computed counts as FACTS:
```javascript
if (matchedFaculty.length > 0 && matchedFaculty.length <= 30) {
  extra += `\n=== MATCHED FACULTY ===\n`;
  matchedFaculty.forEach(f => {
    extra += `- ${f.name} | Dept: ${f.dept} | Total: ${f.matchedPubs} pubs | Cit: ${f.scopusCitations} | H: ${f.hIndex}\n`;
    extra += `  Year-wise: ${Object.entries(f.byYear).sort((a,b) => b[0]-a[0]).map(([y,c]) => `${y}:${c}`).join(', ')}\n`;
    extra += `  Q-rank: Q1:${f.byQRank.Q1}, Q2:${f.byQRank.Q2}, Q3:${f.byQRank.Q3}, Q4:${f.byQRank.Q4}\n`;
  });
  // NO NEED to search rawPubsRef anymore for counts — they're pre-computed
  // Only fetch raw records if user asks to "list" or "show" individual publications
}
```

**Impact:** This one change eliminates the need for Bugs 1-3 code path entirely for count queries. Raw pub search is only needed when the user asks to see individual titles.

---

### Issue 10: PublicationExplorer — Base Context Is Good, Query Context Is Not (Structural)

**File:** `PublicationExplorer.jsx` lines 378-445 (base) vs 448-514 (query)

**What's done well (base context, lines 378-445):**
- Pre-computes Q-rank totals across all departments
- Pre-computes article type counts, indexing counts (Scopus/WoS/SCI/UGC)
- Pre-computes top 15 departments with Q1%, Q2, Q3, Q4 breakdown
- Pre-computes top 15 journals by count
- Year-wise totals with Q1 counts per year

This is ~2K tokens of highly structured aggregate data — similar to FIA v2's approach.

**What's broken (query context, lines 448-514):**
- Searches ALL 6,516 raw records per query (line 464-470)
- Filters by substring match on 6 fields (dept, home authors, authors, journal, title, tech areas)
- After all that filtering, **throws away everything beyond 40 records** (line 486)
- The dept breakdown summary (lines 501-508) is computed from `filtered` (before slicing) — this is correct but only shows top 10 depts, not per-faculty or per-year

**The gap:** Base context knows "CSE has 450 total pubs" but query context can only show 40 of them. If user asks "List CSE's Q1 papers in 2023", the code filters to maybe 15 papers (which fits), but if they ask "How many CSE papers total?", the LLM sees 40 records and may say "40" instead of "450".

**Fix:** Before slicing, inject exact counts:
```javascript
if (filtered.length > 0) {
  // Pre-aggregated summary (ALWAYS include, regardless of slice)
  extra += `\n=== QUERY MATCH SUMMARY ===\n`;
  extra += `Total matched: ${filtered.length} publications\n`;

  // Year breakdown
  const yrCounts = {};
  filtered.forEach(p => { yrCounts[p['YEAR'] || '?'] = (yrCounts[p['YEAR'] || '?'] || 0) + 1; });
  extra += `By year: ${Object.entries(yrCounts).sort((a,b) => b[0]-a[0]).map(([y,c]) => `${y}:${c}`).join(', ')}\n`;

  // Q-rank breakdown
  const qrCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
  filtered.forEach(p => {
    const qr = ((p['Q RANK(SCS)'] || '') + '').trim().toUpperCase();
    if (qrCounts[qr] !== undefined) qrCounts[qr]++; else qrCounts.Unranked++;
  });
  extra += `By Q-rank: Q1:${qrCounts.Q1}, Q2:${qrCounts.Q2}, Q3:${qrCounts.Q3}, Q4:${qrCounts.Q4}, Unranked:${qrCounts.Unranked}\n`;

  // THEN sample records
  const limited = filtered.slice(0, 30);
  extra += `\n=== SAMPLE PUBLICATIONS (${limited.length} of ${filtered.length}) ===\n`;
  // ... existing record formatting ...
}
```

---

### Issue 11: Both Chatbots — No Conversation History Sent to Groq

**AIChatbot.jsx** lines 229-244:
```javascript
const callGroq = async (promptText) => {
  const queryContext = buildQueryContext(promptText);
  // ...
  messages: [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: promptText },    // ← only current message
  ],
```

**PublicationExplorer.jsx** lines 516-551:
```javascript
const callGroq = async (promptText) => {
  const queryContext = buildQueryContext(promptText);
  // ...
  messages: [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: promptText },    // ← only current message
  ],
```

**Problem:** Both chatbots send ONLY the current user message to Groq. Previous messages in the conversation are NOT included. So if a user says:

> User: "Tell me about Dr. Raj Kumar"
> AI: "Dr. Raj Kumar has 45 publications..."
> User: "What about in 2023 specifically?"

The second query sends just `"What about in 2023 specifically?"` — Groq has NO idea who "what" refers to. It will return generic 2023 data, not Dr. Raj Kumar's 2023 data.

**FIA v2 comparison (`AIChatPanel.jsx` lines 146-152):**
```javascript
const apiMessages = [
  { role: 'system', content: systemPrompt },
  ...messages.map(m => ({                       // ← ALL previous messages
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.text,
  })),
];
```

FIA v2 sends the full conversation history. This is why follow-up questions work in FIA but fail in RIA.

**Fix — Send conversation history (last N turns to stay within token budget):**
```javascript
const callGroq = async (promptText) => {
  const queryContext = buildQueryContext(promptText);
  // ...
  // Include last 6 conversation turns for context
  const recentHistory = messages.slice(-6).map(m => ({
    role: m.isBot ? 'assistant' : 'user',
    content: m.text,
  }));

  body: JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemInstruction },
      ...recentHistory,                          // ← previous messages
      { role: 'user', content: promptText },     // ← current message
    ],
    temperature: 0.1,
    max_tokens: 2048,
  }),
```

---

### Issue 12: AIChatbot — `baseContext` Includes Stale `facultyIndex.length` (Line 132)

**Code:**
```javascript
// Line 132
Total faculty in database: ${facultyIndex.length}
(Specific author/faculty data is searched dynamically per query)
```

**Problem:** `baseContext` is a `useMemo` that depends on `[contextData, facultyIndex]`. The `facultyIndex` is also a `useMemo` on `[contextData]`. Both re-compute when `contextData` changes — this is correct. But the comment `"searched dynamically per query"` is misleading for the LLM. The model may think it should wait for more data, when actually it should use what's provided.

**Minor fix:** Change the wording to be more explicit:
```javascript
Total faculty indexed: ${facultyIndex.length}
(For specific faculty queries, matched author data and publications are appended below.)
```

---

## Updated Summary: All Issues at a Glance

| # | File | Type | Issue | Severity | Fix Effort |
|---|------|------|-------|----------|------------|
| 1 | AIChatbot.jsx:170 | Regex bug | `\\s` → name split broken | **HIGH** | 1 min |
| 2 | AIChatbot.jsx:182 | Regex bug | `\\b`, `\\d` → year filter broken | **HIGH** | 1 min |
| 3 | AIChatbot.jsx:203 | String bug | `'\\n'` join → one-line wall of text | **HIGH** | 1 min |
| 4 | AIChatbot.jsx:149 | Logic bug | 3-char substring → false positives | **MEDIUM** | 5 min |
| 5 | AIChatbot.jsx:191 | Hard cap | 50-pub slice → wrong counts | **HIGH** | 20 min |
| 6 | PubExplorer.jsx:486 | Hard cap | 40-pub slice → wrong counts | **MEDIUM** | 20 min |
| 7 | PubExplorer.jsx | Architecture | No pre-aggregation for counts | **MEDIUM** | 30 min |
| 8 | AIChatbot.jsx:50 | Architecture | 6,516 raw records in useRef, searched per query | **LOW** | 1 hr (Option B) |
| 9 | AIChatbot.jsx:53-61 | Data gap | Faculty index missing year/Q-rank breakdown | **HIGH** | 30 min |
| 10 | PubExplorer.jsx:448-514 | Data gap | Good base context but query context loses counts after slice | **HIGH** | 20 min |
| 11 | Both chatbots | Architecture | No conversation history → follow-ups fail | **HIGH** | 15 min each |
| 12 | AIChatbot.jsx:132 | Minor | Misleading comment text sent to LLM | **LOW** | 1 min |

---

## Updated Fix Order

### Phase 1: One-Line Fixes (5 min)
- Bug 1 — fix `\\s` → `\s` in regex literal (line 170)
- Bug 2 — fix `\\b`, `\\d` → `\b`, `\d` in regex literal (line 182)
- Bug 3 — fix `'\\n'` → `'\n'` in join (line 203)
- Bug 12 — fix misleading LLM comment (line 132)

### Phase 2: Logic Fixes (15 min)
- Bug 4 — raise substring threshold to 4 chars (line 149)
- Bug 11 — add conversation history to both `callGroq` functions

### Phase 3: Pre-Aggregation (1 hr)
- Bug 9 — enrich `facultyIndex` with `byYear` and `byQRank` from raw publications
- Bug 5 + 10 — inject exact counts BEFORE slicing in both chatbots
- Bug 6 + 7 — same pattern in PublicationExplorer

### Phase 4: Architecture (Optional, 2 hrs)
- Bug 8 — build a pre-aggregated JSON file at build time (like FIA's `budget_data.json`)
- Eliminate runtime Excel parsing from chatbot components

---

## Test Scenarios After Fixes

| Query | Before Fix | After Fix |
|-------|-----------|-----------|
| "How many publications does Dr. X have?" | Wrong (capped at 50, or 0 if name split fails) | Exact count from enriched faculty index |
| "List Dr. X's papers in 2023" | No year filter (Bug 2), all years returned | Correctly filtered by year |
| "How many Q1 papers does CSE have?" | LLM counts 40 raw records, may say "40" | Exact count injected: "CSE has 127 Q1 papers" |
| "Tell me about Dr. Y" → "What about 2022?" | Groq has no context, gives generic 2022 answer | Follow-up works via conversation history |
| "Publications by Raj" | Matches Rajesh, Rajendra, Neeraj, etc. | 4-char minimum + word-boundary reduces false matches |
