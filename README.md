# RIA Dashboard — Research Intelligence Agent

Role-based research analytics platform for KLE Technological University. Provides hierarchical dashboards for Faculty, HoD, Faculty Dean, Executive Dean, and Vice Chancellor — each tailored to the user's decision-making scope.

---

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173/
```

### Demo Accounts

| Username | Password | Role | Dashboard |
|----------|----------|------|-----------|
| `staff` | `staff123` | Faculty | /staff |
| `hod` | `hod123` | Head of Department | /department |
| `facultydean` | `fdean123` | Faculty Dean | /faculty-dean |
| `executivedean` | `edean123` | Executive Dean | /executive-dean |
| `dean` | `dean123` | Vice Chancellor | /university |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **UI Framework** | React | 19.2.0 |
| **Build Tool** | Vite | 7.3.1 |
| **Routing** | React Router DOM | 7.1.0 |
| **Styling** | Tailwind CSS | 3.4.17 |
| **Charts** | Recharts + Plotly.js | 2.15.0 / 3.4.0 |
| **Animations** | Framer Motion | 11.15.0 |
| **Icons** | Lucide React | 0.468.0 |
| **Excel Parsing** | SheetJS (xlsx) | 0.18.5 |
| **AI Chat** | Groq API (Llama/Mixtral) | - |
| **Database** | Supabase (PostgreSQL 17) | - |

---

## Project Structure

```
RIA-Dashboard/
├── src/
│   ├── App.jsx                    # Routing setup (React Router v7)
│   ├── main.jsx                   # React entry point
│   │
│   ├── auth/
│   │   ├── AuthContext.jsx        # Auth state (localStorage, 5 demo roles)
│   │   └── ProtectedRoute.jsx    # Role-based route guard
│   │
│   ├── pages/
│   │   ├── LoginPage.jsx          # Login with demo account selector
│   │   ├── StaffDashboard.jsx     # Individual faculty metrics
│   │   ├── HodDashboard.jsx       # Redirects to /department
│   │   ├── DeptLayout.jsx         # Department shell with nested routes
│   │   ├── FacultyDeanDashboard.jsx
│   │   ├── ExecutiveDeanDashboard.jsx
│   │   ├── UniversityDeanDashboard.jsx   # VC-level (5 tabs + AI chatbot)
│   │   └── department/            # HoD sub-pages
│   │       ├── DeptOverview.jsx
│   │       ├── DeptResearchOutcomes.jsx
│   │       ├── DeptFacultyData.jsx
│   │       ├── DeptScores.jsx
│   │       └── DeptFacultyList.jsx
│   │
│   ├── components/                # 27 reusable components
│   │   ├── Layout.jsx, Sidebar.jsx, Topbar.jsx
│   │   ├── Charts: DonutChart, NestedDonutChart, StackedBarChart,
│   │   │   SimpleBarChart, HorizontalBarChart, MultiLineChart,
│   │   │   RadarChart, ScatterPlot, SemiCircleGauge, StatGauge
│   │   ├── Data: KPICard, DataTable, TargetProgressCard,
│   │   │   FacultyScoreCard, CategoryScoreBand, ParameterScoreTable
│   │   ├── Panels: AIChatbot, AIInsightsPanel, PublicationListView,
│   │   │   PublicationDetailView, FundedProjectsPanel, PhDTrackingPanel
│   │   └── AlertNotificationCenter
│   │
│   ├── data/
│   │   ├── mockData.js            # Fallback data for all dashboards
│   │   └── excelDataLoader.js     # Parses & aggregates Excel files
│   │
│   └── assets/
│       ├── RIA_Faculty.xlsx       # 739 faculty, 36 metrics
│       ├── RIA_Publications.xlsx  # 6,516 publications, 53 columns
│       └── *.py                   # Python import scripts (Supabase seeding)
│
├── supabase/
│   ├── config.toml                # Local dev config (ports, auth settings)
│   ├── db.sql                     # Full PostgreSQL schema (~1,100 lines)
│   └── snippets/                  # Query snippets for testing
│
├── public/                        # Static Excel files served to frontend
├── package.json
├── vite.config.js
├── tailwind.config.js
└── PROJECT_INSTRUCTIONS.md
```

---

## Dashboard Hierarchy

```
Vice Chancellor (/university)
  5 tabs: Overview | Trends | Research Landscape | Funding & PhD | Benchmarks
  AI Chatbot, Publication search, NIRF tracking
      │
Executive Dean (/executive-dean)
  Campus-level aggregations, inter-campus comparison
      │
Faculty Dean (/faculty-dean)
  Multi-department oversight, department rankings
      │
Head of Department (/department)
  Department KPIs, faculty categories, research outcomes
  Sub-pages: Overview | Research | Faculty Data | Scores | Faculty List
      │
Faculty (/staff)
  Personal metrics, publication list, citation trends, score card
```

---

## Routes

```
/login                    Public — demo accounts or credentials
/                         Redirects to role-specific dashboard
/staff                    Faculty dashboard (role: staff)
/department               HoD dashboard with nested routes:
  /department/            Overview
  /department/research    Research Outcomes
  /department/faculty     Faculty Data
  /department/scores      Score Bands
  /department/faculty-list Faculty List
/faculty-dean             Faculty Dean dashboard
/executive-dean           Executive Dean dashboard
/university               University (VC) dashboard
```

---

## Data Sources

| Source | Records | Used By |
|--------|---------|---------|
| `RIA_Faculty.xlsx` | 739 faculty across 18 institutes, 36 depts | All dashboards |
| `RIA_Publications.xlsx` | 6,516 publications (Scopus, WoS, GS) | VC dashboard, publication views |
| `mockData.js` | Fallback KPIs, rankings, targets | All dashboards |
| Groq API | AI-generated insights | VC dashboard chatbot |

Data flow: Excel files are fetched from `/public`, parsed by `excelDataLoader.js`, aggregated into per-campus/per-institute/per-faculty metrics, and passed to chart components.

---

## Database Schema (Supabase)

6 tables with Row Level Security (RLS):

```
institutes (18)  ──┐
                   ├── departments (36)  ──┐
                   │                       ├── faculty (739)
                   │                       │     │
profiles ──────────┘                       │     └── faculty_publications (M:N)
  (linked to auth.users)                   │              │
                                           └── publications (6,516)
```

**Key tables:**
- **faculty**: 36 metric columns (pub counts, citations, h-index, quartiles, impact factors)
- **publications**: Full metadata (DOI, journal, quartile, indexing flags, NIRF/NAAC relevance)
- **faculty_publications**: Junction table with `is_corresponding` and `match_method`

RLS policies enforce role-based access: Faculty see own data, HoD sees department, Dean sees faculty, VC sees everything.

Schema file: `supabase/db.sql`

---

## Components (27 total)

### Chart Components (11)
| Component | Type | Used For |
|-----------|------|----------|
| DonutChart | Pie/Donut | Q-rank distribution, categories |
| NestedDonutChart | Multi-ring | Nested category breakdown |
| StackedBarChart | Stacked vertical | Publications by year + quartile |
| SimpleBarChart | Horizontal | Department comparisons |
| HorizontalBarChart | Horizontal ranked | Faculty rankings by h-index |
| MultiLineChart | Multi-line | Citation trends (Scopus/WoS/GS) |
| RadarChart | Spider | Multi-metric comparison |
| ScatterPlot | Scatter | Impact factor vs citations |
| SemiCircleGauge | Gauge | Target progress |
| StatGauge | Numeric gauge | KPI progress |

### Data Display Components (6)
| Component | Purpose |
|-----------|---------|
| KPICard | Metric card with delta/trend indicator |
| DataTable | Sortable, filterable generic table |
| TargetProgressCard | Budget target vs actual |
| FacultyScoreCard | Faculty classification display |
| CategoryScoreBand | Score band visualization (SRG/ERG/ERS) |
| ParameterScoreTable | Faculty metrics vs department average |

### Panels (6)
| Component | Purpose |
|-----------|---------|
| AIChatbot | Groq-powered Q&A with dashboard context |
| AIInsightsPanel | Auto-generated narrative insights |
| PublicationListView | Searchable publication list with filters |
| PublicationDetailView | Publication detail modal |
| FundedProjectsPanel | Research project tracking |
| PhDTrackingPanel | PhD scholar supervision tracking |

---

## AI Chatbot

The VC dashboard includes an AI chatbot (`AIChatbot.jsx`) that:
1. Pre-computes a context string from dashboard KPIs, faculty metrics, and publication data
2. Sends user questions + context to Groq API (Llama/Mixtral)
3. Renders markdown responses in a chat interface
4. Supports configurable API key via settings

---

## Design System

### Colors
- **Primary**: KLE Crimson `#B91C1C`
- **Accents**: Teal `#0F766E`, Gold `#B45309`, Indigo `#3730A3`
- **Neutrals**: charcoal, graphite, smoke, ash, mist, fog

### Typography
- **Display**: EB Garamond (serif)
- **Headings**: DM Sans (sans-serif)
- **Body**: Inter (sans-serif)
- **Monospace**: JetBrains Mono

---

## Build & Deploy

```bash
npm install            # Install dependencies
npm run dev            # Development server (http://localhost:5173)
npm run build          # Production build → /dist
npm run preview        # Preview production build
npm run lint           # ESLint check
```

---

## Current Status

### Working
- All 5 role-based dashboards fully implemented
- 27 reusable components with Framer Motion animations
- React Router v7 with role-based redirects
- Excel parsing + data aggregation pipeline
- AI Chatbot with Groq API
- Complete Supabase schema with RLS policies
- Responsive Tailwind CSS design system

### Not Yet Connected
- Frontend reads Excel/mock data, not Supabase APIs
- Authentication uses localStorage, not Supabase Auth
- `faculty_publications` junction table not populated
- Groq API key hardcoded (should be env variable)
- No PDF export, email alerts, or real-time updates

---

## Supabase Local Dev

```bash
supabase start         # Starts local Supabase (API: 54321, DB: 54322, Studio: 54323)
supabase db reset      # Resets DB and applies supabase/db.sql
```

Python import scripts in `src/assets/` can seed faculty and publication data into Supabase.
