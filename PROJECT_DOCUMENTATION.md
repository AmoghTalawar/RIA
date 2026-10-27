# Research Intelligence Agent (RIA) — Comprehensive Project Documentation

**Institution:** KLE Technological University, Hubballi, Karnataka  
**Project Title:** Research Intelligence Agent (RIA) & Multi-Level Analytics Dashboard  
**Version:** 2.0 (Production Release)  
**Date:** September 2026  

---

## 1. Introduction

The **Research Intelligence Agent (RIA)** is an autonomous, multi-tiered research analytics and strategic decision-support platform engineered for **KLE Technological University**. Academic institutions generate vast volumes of research outputs across multiple disciplines, campuses, and publication avenues (Scopus, Web of Science, IEEE, Springer, Nature, etc.). 

RIA unifies this fragmented research landscape into a cohesive, real-time intelligence system. It combines interactive, role-tailored dashboards with a state-of-the-art **Conversational AI Agent** powered by Large Language Models (LLMs) and structured database tool-calling. By autonomously ingesting, normalizing, indexing, and serving institutional data, RIA delivers actionable insights to stakeholders at every echelon of university leadership—from individual faculty members to the Vice Chancellor.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   KLE TECHNOLOGICAL UNIVERSITY                           │
│                      RESEARCH INTELLIGENCE                               │
├───────────────────┬───────────────────┬──────────────────┬───────────────┤
│   VICE CHANCELLOR │  EXECUTIVE DEAN   │   FACULTY DEAN   │   HOD / DEPT  │
│  (University-wide)│ (Campus / School) │ (Faculty Cluster)│ (Dept / Team) │
└─────────▲─────────┴─────────▲─────────┴─────────▲────────┴───────▲───────┘
          │                   │                   │                │
          └───────────────────┴───────────────────┴────────────────┘
                                      ▲
                                      │ [Hierarchical Data Roll-up]
                        ┌─────────────┴─────────────┐
                        │      FACULTY / STAFF      │
                        │ (6,500+ Pubs, 730+ Staff) │
                        └───────────────────────────┘
```

---

## 2. Motivation

In contemporary higher education, institutional reputation, accreditations, and national rankings (such as **NIRF**, **NAAC**, and global QS rankings) are heavily driven by research excellence:
1. **Research Quality Over Quantity:** Institutions must track high-impact journal publications (Scopus **Q1/Q2** quartiles, impact factors, CiteScores) rather than just gross publication counts.
2. **Elimination of Administrative Overhead:** Department heads and deans traditionally spend weeks manually aggregating faculty publication records from spreadsheets, emails, and static PDFs for annual reports and accreditation audits.
3. **Proactive Intervention:** University leadership needs early detection of research velocity changes, declining citation trends, and departmental imbalances rather than discovering them retroactively at year-end.
4. **Democratization of Data:** Faculty members need instant visibility into their own citation trajectories, h-index milestones, and peer benchmarks to drive career growth and collaborative research.

---

## 3. Problem Statement

Traditional research management in academic institutions suffers from severe operational and analytical bottlenecks:

- **Fragmented & Disconnected Data Silos:** Faculty publications, citations, h-indexes, and journal quartile classifications are scattered across external bibliometric databases (Scopus, Web of Science, Google Scholar, OpenAlex) and local departmental records.
- **Author Disambiguation Challenges:** Name variations (e.g., "Ramesh A. Tabib", "R. A. Tabib", "Tabib, Ramesh Ashok"), department migrations, and common surnames lead to inaccurate faculty metrics.
- **Static, Lagged Reporting:** Standard reporting mechanisms are static snapshots that cannot answer dynamic, conversational questions (e.g., *"Which department showed the highest YoY growth in Q1 publications?"* or *"Who are the top 5 cited researchers in CSE?"*).
- **Security & Scope Risks with Generative AI:** Naive LLM integrations that generate raw SQL frequently produce hallucinated numbers, syntax errors, or expose the database to destructive queries and data leaks.

---

## 4. Objectives

### Primary Objective
To design, develop, and deploy an end-to-end, multi-level **Research Intelligence Agent (RIA)** that provides automated, real-time bibliometric visibility, hierarchical dashboards, and a secure conversational natural language interface for KLE Technological University.

### Specific Objectives
1. **Hierarchical Multi-Role Dashboards:** Deliver dedicated analytical views calibrated for 5 distinct roles: Faculty/Staff, Head of Department (HoD), Faculty Dean, Executive Dean, and Vice Chancellor.
2. **Robust Data Aggregation & Disambiguation:** Ingest and index 6,500+ publications and 730+ faculty profiles, resolving author identities via PostgreSQL trigram similarity (`pg_trgm`).
3. **Zero-Hallucination AI Agent:** Implement a hybrid conversational architecture combining:
   - A **0-LLM Deterministic Intent Router** for instant, cost-free SQL execution of standard queries.
   - A **6-Tool Function-Calling Agent** using Groq LLMs (`llama-3.3-70b-versatile`) to reliably query specific database slices.
4. **Deep Bibliometric Analytics:** Track Scopus & WoS citation trends, h-indexes, Q1–Q4 quartile distributions, CiteScores, and Year-over-Year (YoY) institutional growth.
5. **Production-Ready Security & Privacy:** Maintain zero database credentials in the browser, enforce read-only execution constraints, and provide responsive light/dark theme UIs.

---

## 5. System Architecture

RIA is designed as a three-tier architecture ensuring decoupled scalability, low latency, and robust data isolation:

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      PRESENTATION LAYER (Frontend)                     │
 │  React 19 • Vite 7 • Tailwind CSS • Recharts • Plotly.js • Lucide UI   │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS / JSON REST
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      APPLICATION LAYER (FastAPI)                       │
 │  FastAPI • Uvicorn • ThreadPool Executor • In-Memory TTL Cache         │
 │                                                                        │
 │  ┌──────────────────────────────────────────────────────────────────┐  │
 │  │                 Conversational AI Engine                         │  │
 │  │                                                                  │  │
 │  │  User Query ──► [Intent Router] ──(Direct Match)──► [Direct SQL] │  │
 │  │                       │ (Unmatched)                              │  │
 │  │                       ▼                                          │  │
 │  │             [RIA Agent Tool Loop]                                │  │
 │  │          (Groq Llama 3.3-70b Versatile)                          │  │
 │  │                       │                                          │  │
 │  │    ┌──────────────────┴──────────────────┐                       │  │
 │  │    ▼                                     ▼                       │  │
 │  │ [6 Specialized Tools]            [SQL Tool RPC]                  │  │
 │  └──────────────────────────────────────────────────────────────────┘  │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ Secure RPC (PostgreSQL 15+)
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                        DATA LAYER (Supabase DB)                        │
 │  Schema: `ria`                                                         │
 │  • Tables: publications (6.5k), faculty (730), departments, institutes │
 │  • Views: v_faculty_full, v_institute_summary                          │
 │  • Extensions: pg_trgm (fuzzy string matching), RPC exec_sql           │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Details

### 6.1 Database Schema & Indexing Layer
The backend connects to a self-hosted Supabase PostgreSQL database under the dedicated `ria` schema:
- **`v_faculty_full` View:** Pre-aggregates individual researcher metrics (total publication count, Scopus citations, Scopus h-index, Web of Science metrics, Q1/Q2/Q3/Q4 counts, journal/conference breakdown, avg impact factor, and CiteScore).
- **Fuzzy Name Matching:** Utilizes PostgreSQL `pg_trgm` similarity functions:
  ```sql
  SELECT author_name, department, scopus_hindex, scopus_citation,
         ROUND(similarity(author_name, 'Ramesh Tabib')::numeric, 4) AS match_score
  FROM v_faculty_full
  WHERE similarity(author_name, 'Ramesh Tabib') > 0.2
  ORDER BY match_score DESC LIMIT 5;
  ```
- **Foreign Key Department Joins:** Departmental statistics strictly join across `departments.id = publications.matched_department_id` ensuring verified aggregation.

---

### 6.2 The 6 Specialized Agent Tools
The agent uses structured OpenAI-compatible tool specifications in [`ria_tools_groq.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_tools_groq.py):

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           RIA AGENT TOOL SUITE                                 │
├───────────────────────────────┬────────────────────────────────────────────────┤
│ Tool Name                     │ Functionality & Scope                          │
├───────────────────────────────┼────────────────────────────────────────────────┤
│ 1. get_faculty_stats          │ Fuzzy name matching for individual faculty;    │
│                               │ returns h-index, citations, Q1-Q4 counts.      │
├───────────────────────────────┼────────────────────────────────────────────────┤
│ 2. get_department_stats       │ Department-level aggregations, faculty counts, │
│                               │ total citations, cumulative h-index, top staff.│
├───────────────────────────────┼────────────────────────────────────────────────┤
│ 3. count_qrank_publications   │ Counts publications by Q-rank tier (Q1-Q4),    │
│                               │ university-wide or department/year filtered.   │
├───────────────────────────────┼────────────────────────────────────────────────┤
│ 4. search_publications_by_auth│ Returns paper titles, publication years,       │
│                               │ journal names, and citations for an author.    │
├───────────────────────────────┼────────────────────────────────────────────────┤
│ 5. compare_entities           │ Leaderboards & comparative rankings of         │
│                               │ departments or faculty by selected metric.     │
├───────────────────────────────┼────────────────────────────────────────────────┤
│ 6. get_yearly_stats           │ Annual publication counts & Year-over-Year     │
│                               │ (YoY) percentage growth calculations.          │
└───────────────────────────────┴────────────────────────────────────────────────┘
```

#### Tool 1: `get_faculty_stats(faculty_name, source)`
Retrieves deep individual bibliometrics. Handles spelling errors and initials via similarity scoring. Disambiguates between multiple faculty members with similar names.

#### Tool 2: `get_department_stats(department, top_n)`
Aggregates department productivity. Expands abbreviations (e.g., `"CSE"` → `"Computer Science and Engineering"`, `"ECE"` → `"Electronics and Communication Engineering"`).

#### Tool 3: `count_qrank_publications(qrank, department, year)`
Calculates journal quality distributions across Scopus quartile rankings (Q1 = top 25%, Q2 = 25–50%, etc.).

#### Tool 4: `search_publications_by_author(author_name, year, qrank, department, limit)`
Enables users to inspect actual papers, titles, and journal venues authored by a specific researcher.

#### Tool 5: `compare_entities(entity_type, entities, metric, top_n, department)`
Powers head-to-head comparisons and leaderboard rankings. Supports sorting by `citations`, `publications`, `hindex`, `q1_count`, `journals`, or `conferences`.

#### Tool 6: `get_yearly_stats(year, department)`
Analyzes longitudinal research trends, calculating compound publication volume and annual growth rates.

---

### 6.3 Hybrid Chatbot Routing & Tool Calling Loop
To optimize performance and eliminate token consumption on standard queries:
1. **Deterministic Intent Router ([`intent_router.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/intent_router.py)):**
   - Intercepts 7 common query archetypes (e.g., *"Total Q1 papers"*, *"Publications in 2024"*, *"Top 10 faculty by citations"*).
   - Executes parameterized SQL directly in **< 15ms** with **0 LLM token cost**.
2. **Groq Llama 3.3-70B Tool Calling Agent ([`ria_agent.py`](file:///e:/RIA_GitHUb/RIA-Dashboard/backend/ria_agent.py)):**
   - If no direct intent matches, the prompt passes to the agent with `tool_choice="auto"`.
   - The LLM selects the exact tool, receives the JSON output, and formats a natural-language answer adhering to institutional guidelines.

---

### 6.4 Role-Based Frontend Dashboards

```
                        ROLE-BASED DASHBOARD MATRIX
┌──────────────────┬─────────────────────────────────────────────────────────────┐
│ Dashboard Level  │ Key Metrics & Features                                      │
├──────────────────┼─────────────────────────────────────────────────────────────┤
│ 1. Faculty       │ Personal publications, Scopus h-index, citations over time, │
│    (/staff)      │ Q-rank distribution, co-authorship network.                 │
├──────────────────┼─────────────────────────────────────────────────────────────┤
│ 2. HoD           │ Department total citations, top faculty leaderboard,        │
│    (/department) │ conference vs journal ratios, annual department targets.    │
├──────────────────┼─────────────────────────────────────────────────────────────┤
│ 3. Faculty Dean  │ Cluster-level department benchmarking, faculty productivity │
│  (/faculty-dean) │ distributions, cross-department collaborative index.        │
├──────────────────┼─────────────────────────────────────────────────────────────┤
│ 4. Executive Dean│ Multi-school comparisons, resource allocation analytics,    │
│ (/executive-dean)│ high-impact journal output (Q1/Q2 concentration).           │
├──────────────────┼─────────────────────────────────────────────────────────────┤
│ 5. Vice Chancellor│ Institutional NIRF positioning, total university citations, │
│   (/university)  │ YoY growth rates, global impact metrics, executive summary. │
└──────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 7. Results & Key Highlights

- **Instant Latency:** Direct intent queries execute in **< 20ms**; LLM tool-calling responses complete in **1.5 – 2.5 seconds**.
- **High Data Integrity:** Zero fabricated citations or hallucinated author metrics by constraining the LLM to pre-validated tool outputs.
- **Complete Institutional Coverage:** 6,516 publication records and 739 faculty members cataloged and accessible across all campuses.
- **Seamless User Experience:** Real-time search, interactive publication filtering, CSV/Excel export capabilities, and dark/light mode support.

---

## 8. Summary & Conclusion

The **Research Intelligence Agent (RIA)** modernizes research governance at KLE Technological University. By replacing slow, manual reporting cycles with autonomous data synchronization, role-tailored analytical dashboards, and an intelligent tool-calling chatbot, RIA empowers academic leadership to make rapid, evidence-based strategic decisions. 

The platform bridges the gap between raw bibliometric data and strategic intelligence—ensuring that faculty achievements are recognized, departmental strengths are maximized, and institutional goals for global research prominence are methodically achieved.
