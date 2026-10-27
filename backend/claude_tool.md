# Claude Tool-Use System Documentation

## Overview

This is a pure Claude tool-use system with no regex patterns, no intent routing—just Claude, 8 semantic tools, and SQL fallback.

## Architecture Diagram
┌─────────────────────────────────────────────────────────┐
│                    User Interface                        │
│              (React chatbot component)                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ HTTP POST /chat
                      │ {"message": "stats on Sunil VG"}
                      ↓
┌─────────────────────────────────────────────────────────┐
│                FastAPI Backend (main.py)                 │
│  - Receives user message                                │
│  - Calls chat_with_claude()                             │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│          Claude Agent (claude_tools/agent.py)            │
│                                                          │
│  System Prompt:                                         │
│  "You are a research analytics assistant. Use tools     │
│   to answer queries about faculty and publications."    │
│                                                          │
│  Tools Available: [8 semantic tools + execute_sql]     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Call Anthropic API
                      ↓
┌─────────────────────────────────────────────────────────┐
│              Claude API (Anthropic Cloud)                │
│                                                          │
│  1. Reads tool descriptions                             │
│  2. Analyzes user query                                 │
│  3. Decides which tool to call                          │
│  4. Returns: {tool: "get_faculty_stats",                │
│              input: {faculty_name: "Sunil VG"}}         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Tool call returned
                      ↓
┌─────────────────────────────────────────────────────────┐
│        Tool Dispatcher (claude_tools/tool_handlers.py)   │
│                                                          │
│  Receives: {tool: "get_faculty_stats",                  │
│            input: {faculty_name: "Sunil VG"}}           │
│                                                          │
│  Calls: handle_get_faculty_stats("Sunil VG")            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Handler builds SQL
                      ↓
┌─────────────────────────────────────────────────────────┐
│              SQL Execution (sql_tool.py)                 │
│                                                          │
│  SQL: SELECT author_name, total_pub_count, ...          │
│       FROM v_faculty_full                               │
│       WHERE similarity(author_name,'Sunil VG')>0.3      │
│                                                          │
│  Calls: Supabase RPC exec_sql()                         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Rows returned
                      ↓
┌─────────────────────────────────────────────────────────┐
│              Database (PostgreSQL/Supabase)              │
│                                                          │
│  Returns: [{                                            │
│    author_name: "Sunil VG",                             │
│    total_pub_count: 87,                                 │
│    scopus_citation: 1245,                               │
│    scopus_hindex: 18                                    │
│  }]                                                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Format result
                      ↓
┌─────────────────────────────────────────────────────────┐
│              Handler Returns Structured JSON             │
│                                                          │
│  {                                                      │
│    "status": "success",                                 │
│    "data": {                                            │
│      "name": "Sunil VG",                                │
│      "publications": 87,                                │
│      "citations": 1245,                                 │
│      "h_index": 18                                      │
│    }                                                    │
│  }                                                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Send tool_result back to Claude
                      ↓
┌─────────────────────────────────────────────────────────┐
│              Claude API (Second Call)                    │
│                                                          │
│  Receives tool result, formats natural language:        │
│  "**Sunil VG** has 87 publications, 1,245 citations,   │
│   and an h-index of 18."                                │
│                                                          │
│  stop_reason: "end_turn"                                │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Final response
                      ↓
┌─────────────────────────────────────────────────────────┐
│                    User Sees Answer                      │
└─────────────────────────────────────────────────────────┘

## Complete File Structure
backend/
├── claude_tools/
│   ├── __init__.py              # Package marker (empty)
│   ├── tool_definitions.py      # 8 tools + execute_sql
│   ├── tool_handlers.py         # Handler functions
│   └── agent.py                 # Agentic loop
├── sql_tool.py                  # EXISTING (reused)
├── main.py                      # MODIFIED (add endpoint)
├── requirements.txt             # MODIFIED (add anthropic)
├── .env                         # MODIFIED (add ANTHROPIC_API_KEY)
└── .env.example                 # MODIFIED (document new vars)

## Step-by-Step Implementation

### Step 1: Install Dependencies
1.1 Update requirements.txt
```txt
# Existing dependencies
fastapi==0.104.1
uvicorn==0.24.0
supabase==2.0.3
python-dotenv==1.0.0
pydantic==2.5.0

# NEW: Add Anthropic SDK
anthropic==0.39.0
```
1.2 Install
```bash
pip install anthropic==0.39.0
```

### Step 2: Environment Configuration
2.1 Update .env.example
```bash
# Supabase (existing)
SUPABASE_URL=http://localhost:54329
SUPABASE_KEY=your_supabase_anon_key_here

# NEW: Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
CLAUDE_MODEL=claude-sonnet-4-20250514

# Optional: Rate limiting
MAX_TOKENS=4096
TIMEOUT_SECONDS=60
```
2.2 Create/Update Your .env
```bash
# Copy example and fill in real values
cp .env.example .env

# Edit .env with your actual Anthropic API key
# Get key from: https://console.anthropic.com/settings/keys
```

### Step 3: Tool Definitions
3.1 Create backend/claude_tools/__init__.py
```python
"""
Claude tool-use module for RIA Dashboard.
Provides semantic tools for querying faculty and publication data.
"""

__version__ = "1.0.0"
```
3.2 Create backend/claude_tools/tool_definitions.py
This file defines all 8 tools following Anthropic's exact format.
```python
"""
Tool definitions for Claude API following Anthropic best practices.

Reference: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools

Each tool:
- Has a single, clear purpose
- Includes 4+ sentence description
- Specifies when to use AND when NOT to use
- Uses JSON Schema for input validation
"""

#### Semantic Tools (8 tools for common research queries)

TOOL_GET_FACULTY_STATS = {
    "name": "get_faculty_stats",
    "description": (
        "Retrieve comprehensive statistics for a single faculty member by name. "
        "Returns publication count, Scopus citations, h-index, Q1 publication count, "
        "total journals published in, total conferences, department, and institute affiliation. "
        "Use this tool when the user asks for stats, profile, metrics, or research output "
        "about a specific named individual. The tool uses fuzzy name matching with pg_trgm, "
        "so minor typos are handled automatically (e.g., 'Uma Mudengudi' vs 'Uma Mudangudi'). "
        "If multiple faculty members match the name, it returns disambiguation options with "
        "department context so the user can clarify which person they meant. "
        "Do NOT use this tool for listing top faculty (use list_top_faculty instead), "
        "comparing multiple people, or getting department-wide statistics (use get_department_stats)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "faculty_name": {
                "type": "string",
                "description": (
                    "Full or partial name of the faculty member. Examples: 'Sunil VG', "
                    "'Patil', 'Uma Mudengudi', 'Banapurmath'. Fuzzy matching is enabled "
                    "with similarity threshold 0.3, so approximate spelling works."
                )
            }
        },
        "required": ["faculty_name"]
    }
}

TOOL_LIST_TOP_FACULTY = {
    "name": "list_top_faculty",
    "description": (
        "Find the top N faculty members ranked by a specific research metric, optionally "
        "filtered to a single department or institute. Supported metrics are: 'publications' "
        "(total publication count), 'citations' (Scopus citation count), 'h_index' (Scopus h-index), "
        "and 'q1_count' (number of Q1 journal publications). Returns a ranked list with faculty "
        "names, their departments, and the selected metric value. Use this when the user asks for "
        "'top researchers', 'best faculty', 'leading scholars', 'highest citations', 'most productive', "
        "or any ranking question. The department filter supports fuzzy matching, so 'CSE', 'Computer Science', "
        "and 'Computer Science and Engineering' all work. Do NOT use this for looking up a single named "
        "faculty member (use get_faculty_stats instead) or for department aggregate statistics "
        "(use get_department_stats instead)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "metric": {
                "type": "string",
                "enum": ["publications", "citations", "h_index", "q1_count"],
                "description": (
                    "The metric to rank faculty by. Choose 'publications' for total research output, "
                    "'citations' for research impact, 'h_index' for balanced productivity and impact, "
                    "or 'q1_count' for top-tier journal publication focus."
                )
            },
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 50,
                "description": "Number of top faculty to return. Default is 10, maximum is 50."
            },
            "department": {
                "type": "string",
                "description": (
                    "Optional department or institute filter. Examples: 'CSE', 'Computer Science', "
                    "'Mechanical Engineering', 'ECE'. Fuzzy matching enabled. If omitted, returns "
                    "university-wide ranking across all departments."
                )
            }
        },
        "required": ["metric"]
    }
}

TOOL_GET_DEPARTMENT_STATS = {
    "name": "get_department_stats",
    "description": (
        "Get aggregate statistics for an entire department or institute including faculty count, "
        "total publications, total Scopus citations, average h-index across all faculty in that "
        "department, and total Q1 publication count. Use this when the user asks about overall "
        "department performance, department metrics, departmental research output, or comparing "
        "departments. The department parameter uses fuzzy matching to handle variations like 'CSE' "
        "vs 'Computer Science and Engineering' vs 'School of Computer Science'. Do NOT use this "
        "for individual faculty members within a department (use get_faculty_stats or list_top_faculty "
        "instead) or for listing individual publications (use search_publications_by_author instead)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "department": {
                "type": "string",
                "description": (
                    "Department or institute name or abbreviation. Examples: 'CSE', 'Computer Science', "
                    "'Mechanical', 'ECE', 'Electronics and Communication Engineering'. Fuzzy matching "
                    "is enabled to handle naming variations."
                )
            }
        },
        "required": ["department"]
    }
}

TOOL_COUNT_PUBLICATIONS_BY_YEAR = {
    "name": "count_publications_by_year",
    "description": (
        "Count the total number of publications for a specific year, optionally filtered by department. "
        "Returns a single integer count. Use this when the user asks 'how many papers in YYYY' or "
        "'publication count for YYYY' or 'papers published in YYYY'. If a department is specified, "
        "only publications where home authors belong to that department are counted (uses the "
        "home_author_department field which contains KLE faculty affiliations). For multi-year trends "
        "or year-over-year growth analysis, use get_publication_trend instead. For breakdown by Q-rank "
        "within a year, the user should follow up with get_qrank_distribution after getting the total count."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "year": {
                "type": "integer",
                "minimum": 2000,
                "maximum": 2026,
                "description": "Publication year. Valid range is 2000-2026."
            },
            "department": {
                "type": "string",
                "description": (
                    "Optional department filter (e.g., 'CSE', 'Mechanical Engineering'). If omitted, "
                    "returns university-wide count for that year. Fuzzy matching enabled."
                )
            }
        },
        "required": ["year"]
    }
}

TOOL_GET_QRANK_DISTRIBUTION = {
    "name": "get_qrank_distribution",
    "description": (
        "Get the breakdown of publications by Scopus Q-rank (Q1, Q2, Q3, Q4) as both raw counts and "
        "percentages of total ranked publications, optionally scoped to a specific department. Returns "
        "structured data with each Q-rank tier, its count, and percentage. Use this when the user asks "
        "for 'Q-rank distribution', 'journal quality breakdown', 'quartile split', 'quality breakdown', "
        "or 'how publications are distributed across Q1/Q2/Q3/Q4'. If the user asks for a single Q-rank "
        "count like 'how many Q1 papers' or 'Q2 count', use count_qrank_publications instead for efficiency. "
        "This tool counts directly from the publications table using the q_rank_scopus column and "
        "home_author_department field for department filtering. It does NOT use the incomplete "
        "faculty_publications junction table, ensuring accurate counts."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "department": {
                "type": "string",
                "description": (
                    "Optional department filter (e.g., 'CSE', 'Mechanical'). If omitted, returns "
                    "university-wide distribution across all departments. Fuzzy matching enabled."
                )
            }
        },
        "required": []
    }
}

TOOL_COUNT_QRANK_PUBLICATIONS = {
    "name": "count_qrank_publications",
    "description": (
        "Count the number of publications in a specific Scopus Q-rank tier (Q1, Q2, Q3, or Q4), "
        "optionally filtered by department. Returns a single integer count. Use this when the user "
        "asks 'how many Q1 papers', 'Q2 publication count', 'number of Q3 journals', 'Q4 count', "
        "or any single-tier count question. If the user wants the breakdown across all four tiers "
        "with percentages, use get_qrank_distribution instead. This tool queries the publications "
        "table directly using the q_rank_scopus column and home_author_department field for department "
        "filtering, ensuring accurate counts without relying on the incomplete faculty_publications "
        "junction table which only covers 84.8% of records."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "qrank": {
                "type": "string",
                "enum": ["Q1", "Q2", "Q3", "Q4"],
                "description": "The Q-rank tier to count. Must be exactly 'Q1', 'Q2', 'Q3', or 'Q4' (case-sensitive)."
            },
            "department": {
                "type": "string",
                "description": (
                    "Optional department filter. If omitted, returns university-wide count for that Q-rank. "
                    "Fuzzy matching enabled for department names."
                )
            }
        },
        "required": ["qrank"]
    }
}

TOOL_GET_PUBLICATION_TREND = {
    "name": "get_publication_trend",
    "description": (
        "Retrieve year-over-year publication counts for the most recent N years, optionally filtered "
        "by department. Returns a time series with year, publication count, and year-over-year growth "
        "percentage calculated as ((current_year - previous_year) / previous_year * 100). Use this when "
        "the user asks for 'trends', 'growth over time', 'publication trajectory', 'yearly comparison', "
        "'how are publications changing', 'research output trend', or any temporal analysis question. "
        "The default lookback is 5 years, adjustable from 3-10 years. For a single year's count, use "
        "count_publications_by_year instead. The trend data helps identify growth patterns, declines, "
        "or stability in research output over time at either the department or university level."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "years": {
                "type": "integer",
                "minimum": 3,
                "maximum": 10,
                "description": (
                    "Number of recent years to include in the trend. Default is 5 years. "
                    "Range is 3-10 years. For example, years=5 in 2026 returns data for 2022-2026."
                )
            },
            "department": {
                "type": "string",
                "description": (
                    "Optional department filter. If omitted, returns university-wide trend. "
                    "Fuzzy matching enabled for department names."
                )
            }
        },
        "required": []
    }
}

TOOL_SEARCH_PUBLICATIONS_BY_AUTHOR = {
    "name": "search_publications_by_author",
    "description": (
        "Find publications authored or co-authored by a specific person, optionally filtered by year "
        "or journal Q-rank. Returns a list of publications with title, year, journal or conference name, "
        "Scopus citations, and Q-rank. Use this when the user asks 'papers by X', 'publications from X', "
        "'articles written by X', 'research output of X', or wants to see actual publication titles and "
        "details rather than aggregate counts. The author_name parameter uses fuzzy matching on the "
        "home_authors field (semicolon-separated list of KLE faculty names). For aggregated statistics "
        "about the author like total publication count, total citations, and h-index, use get_faculty_stats "
        "instead. Results are limited to 10 publications by default (adjustable up to 50) and sorted by "
        "citation count descending to show the most impactful work first."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "author_name": {
                "type": "string",
                "description": (
                    "Full or partial author name (e.g., 'Sunil VG', 'Patil', 'Banapurmath'). "
                    "Fuzzy matching enabled on the home_authors field."
                )
            },
            "year": {
                "type": "integer",
                "minimum": 2000,
                "maximum": 2026,
                "description": "Optional year filter. If specified, only returns publications from that year."
            },
            "qrank": {
                "type": "string",
                "enum": ["Q1", "Q2", "Q3", "Q4"],
                "description": "Optional Q-rank filter. If specified, only returns publications in that quartile."
            },
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 50,
                "description": "Maximum number of publications to return. Default is 10, maximum is 50."
            }
        },
        "required": ["author_name"]
    }
}

#### SQL Fallback Tool (added on retry if semantic tools fail)

TOOL_EXECUTE_SQL = {
    "name": "execute_sql",
    "description": (
        "Execute a custom SQL SELECT query on the research database. This is a fallback tool for "
        "complex analytical queries that cannot be answered by the other specialized semantic tools "
        "(get_faculty_stats, list_top_faculty, etc.). Only use this when the semantic tools genuinely "
        "cannot handle the user's request. Common scenarios requiring SQL: multi-table joins with complex "
        "conditions, custom aggregations across unusual groupings, novel metrics not covered by standard "
        "tools, percentile calculations, or queries combining multiple filters in non-standard ways. "
        "CRITICAL CONSTRAINTS: Only SELECT statements are allowed for security (no INSERT/UPDATE/DELETE). "
        "When querying publications, use the home_author_department field for department filtering (NOT "
        "the incomplete faculty_publications join table which only covers 84.8% of records). Use the "
        "similarity() function for fuzzy name matching with threshold >0.3. Always LIMIT results to 100 "
        "rows maximum to avoid overwhelming responses."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "sql": {
                "type": "string",
                "description": (
                    "A valid PostgreSQL SELECT query. Must start with SELECT (case-insensitive). "
                    "Important guidelines: Use home_authors field (semicolon-separated) for faculty name "
                    "filtering in publications table, NOT the authors field which includes all co-authors "
                    "globally. Use home_author_department for department-level publication filtering. "
                    "Use similarity(column, 'search_term') > 0.3 for fuzzy matching. Always include "
                    "ORDER BY and LIMIT clauses. Example: SELECT author_name, total_pub_count FROM "
                    "v_faculty_full WHERE similarity(author_name,'Patil')>0.3 ORDER BY similarity "
                    "DESC LIMIT 5"
                )
            }
        },
        "required": ["sql"]
    }
}

#### Exports

# 8 semantic tools (always available)
SEMANTIC_TOOLS = [
    TOOL_GET_FACULTY_STATS,
    TOOL_LIST_TOP_FACULTY,
    TOOL_GET_DEPARTMENT_STATS,
    TOOL_COUNT_PUBLICATIONS_BY_YEAR,
    TOOL_GET_QRANK_DISTRIBUTION,
    TOOL_COUNT_QRANK_PUBLICATIONS,
    TOOL_GET_PUBLICATION_TREND,
    TOOL_SEARCH_PUBLICATIONS_BY_AUTHOR
]

# All tools (includes SQL fallback)
ALL_TOOLS = SEMANTIC_TOOLS + [TOOL_EXECUTE_SQL]

# Default: Start with semantic tools only, add SQL on retry
DEFAULT_TOOLS = SEMANTIC_TOOLS

3.3 Create backend/claude_tools/tool_handlers.py

This file implements the actual SQL execution for each tool.

```python
"""
Tool execution handlers for Claude tool-use system.

Each handler:
1. Receives typed parameters from Claude's tool call
2. Builds optimized SQL query following schema rules
3. Executes via sql_tool.execute_sql()
4. Returns structured JSON result

Reference: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
"""

import logging
from typing import Dict, Any, List, Optional
import sys
import os

# Add parent directory to path to import sql_tool
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sql_tool import execute_sql

log = logging.getLogger("ria.handlers")


## Helper Functions

```python
def escape_sql(value: str) -> str:
    """Escape single quotes for SQL injection prevention."""
    return value.replace("'", "''")


def format_error(error_message: str) -> Dict[str, Any]:
    """Standard error response format."""
    return {
        "status": "error",
        "message": str(error_message)
    }


def check_db_error(rows: Any) -> Optional[Dict[str, Any]]:
    """Check if execute_sql returned an error dict."""
    if isinstance(rows, dict) and "error" in rows:
        return format_error(f"Database error: {rows['error']}")
    return None
```

## Tool Handlers

```python
def handle_get_faculty_stats(faculty_name: str) -> Dict[str, Any]:
    """
    Handler for get_faculty_stats tool.
    Returns comprehensive stats for a single faculty member.
    """
    log.info(f"[get_faculty_stats] Looking up: {faculty_name}")
    
    name_escaped = escape_sql(faculty_name)
    
    sql = f"""
        SELECT 
            author_name, 
            department, 
            institute, 
            institute_short,
            total_pub_count, 
            scopus_citation, 
            scopus_hindex, 
            scopus_q1_count,
            scopus_q2_count,
            journal_count, 
            conference_count,
            avg_citescore,
            avg_impfactor
        FROM v_faculty_full
        WHERE similarity(author_name, '{name_escaped}') > 0.3
        ORDER BY similarity(author_name, '{name_escaped}') DESC
        LIMIT 5
    """
    
    rows = execute_sql(sql)
    
    # Check for database errors
    err = check_db_error(rows)
    if err:
        return err
    
    # No matches found
    if len(rows) == 0:
        return {
            "status": "no_match",
            "message": f"No faculty found matching '{faculty_name}'. Try using the full name or check spelling."
        }
    
    # Multiple matches - need disambiguation
    if len(rows) > 1:
        return {
            "status": "ambiguous",
            "message": f"Found {len(rows)} faculty members matching '{faculty_name}':",
            "candidates": [
                {
                    "name": r["author_name"],
                    "department": r["department"],
                    "institute": r["institute_short"],
                    "publications": r["total_pub_count"]
                } for r in rows
            ]
        }
    
    # Single match - return full stats
    faculty = rows[0]
    return {
        "status": "success",
        "data": {
            "name": faculty["author_name"],
            "department": faculty["department"],
            "institute": faculty["institute"],
            "institute_short": faculty["institute_short"],
            "publications": faculty["total_pub_count"] or 0,
            "citations": faculty["scopus_citation"] or 0,
            "h_index": faculty["scopus_hindex"] or 0,
            "q1_count": faculty["scopus_q1_count"] or 0,
            "q2_count": faculty["scopus_q2_count"] or 0,
            "journals": faculty["journal_count"] or 0,
            "conferences": faculty["conference_count"] or 0,
            "avg_cite_score": float(faculty["avg_citescore"]) if faculty["avg_citescore"] else 0,
            "avg_impact_factor": float(faculty["avg_impfactor"]) if faculty["avg_impfactor"] else 0
        }
    }


def handle_list_top_faculty(
    metric: str, 
    limit: int = 10, 
    department: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handler for list_top_faculty tool.
    Returns top N faculty ranked by metric, optionally filtered by department.
    """
    log.info(f"[list_top_faculty] metric={metric}, limit={limit}, dept={department}")
    
    # Map metric names to column names
    metric_map = {
        "publications": "total_pub_count",
        "citations": "scopus_citation",
        "h_index": "scopus_hindex",
        "q1_count": "scopus_q1_count"
    }
    
    col = metric_map.get(metric)
    if not col:
        return format_error(f"Invalid metric: {metric}. Must be one of: {list(metric_map.keys())}")
    
    # Validate limit
    if limit < 1 or limit > 50:
        limit = 10
    
    # Build department filter if provided
    dept_filter = ""
    if department:
        dept_escaped = escape_sql(department)
        dept_filter = f"WHERE (institute_short ILIKE '%{dept_escaped}%' OR department ILIKE '%{dept_escaped}%')"
    
    sql = f"""
        SELECT 
            author_name, 
            department, 
            institute_short, 
            {col} as metric_value
        FROM v_faculty_full
        {dept_filter}
        ORDER BY {col} DESC NULLS LAST
        LIMIT {limit}
    """
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    if len(rows) == 0:
        if department:
            return format_error(f"No faculty found in department: {department}")
        return format_error("No faculty data available")
    
    return {
        "status": "success",
        "metric": metric,
        "department": department,
        "count": len(rows),
        "data": [
            {
                "rank": i + 1,
                "name": r["author_name"],
                "department": r["department"],
                "institute_short": r["institute_short"],
                "value": r["metric_value"] or 0
            } for i, r in enumerate(rows)
        ]
    }


def handle_get_department_stats(department: str) -> Dict[str, Any]:
    """
    Handler for get_department_stats tool.
    Returns aggregate statistics for an entire department.
    """
    log.info(f"[get_department_stats] dept={department}")
    
    dept_escaped = escape_sql(department)
    
    sql = f"""
        SELECT 
            department,
            institute,
            COUNT(DISTINCT id) as faculty_count,
            COALESCE(SUM(total_pub_count), 0) as total_publications,
            COALESCE(SUM(scopus_citation), 0) as total_citations,
            ROUND(AVG(scopus_hindex)::numeric, 1) as avg_h_index,
            COALESCE(SUM(scopus_q1_count), 0) as total_q1,
            COALESCE(SUM(journal_count), 0) as total_journals,
            COALESCE(SUM(conference_count), 0) as total_conferences
        FROM v_faculty_full
        WHERE institute_short ILIKE '%{dept_escaped}%' 
           OR department ILIKE '%{dept_escaped}%'
           OR institute ILIKE '%{dept_escaped}%'
        GROUP BY department, institute
        ORDER BY total_publications DESC
        LIMIT 1
    """
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    if len(rows) == 0:
        return {
            "status": "no_match",
            "message": f"No department found matching '{department}'"
        }
    
    dept = rows[0]
    return {
        "status": "success",
        "data": {
            "department": dept["department"],
            "institute": dept["institute"],
            "faculty_count": dept["faculty_count"],
            "total_publications": dept["total_publications"],
            "total_citations": dept["total_citations"],
            "avg_h_index": float(dept["avg_h_index"]) if dept["avg_h_index"] else 0,
            "total_q1": dept["total_q1"],
            "total_journals": dept["total_journals"],
            "total_conferences": dept["total_conferences"]
        }
    }


def handle_count_publications_by_year(
    year: int, 
    department: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handler for count_publications_by_year tool.
    Counts publications for a specific year, optionally by department.
    """
    log.info(f"[count_publications_by_year] year={year}, dept={department}")
    
    # Build department filter
    dept_filter = ""
    if department:
        dept_escaped = escape_sql(department)
        dept_filter = f"AND home_author_department ILIKE '%{dept_escaped}%'"
    
    sql = f"""
        SELECT COUNT(*)::int AS cnt
        FROM publications
        WHERE year = {year} {dept_filter}
    """
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    count = rows[0]["cnt"] if rows else 0
    
    return {
        "status": "success",
        "year": year,
        "department": department,
        "count": count
    }


def handle_get_qrank_distribution(department: Optional[str] = None) -> Dict[str, Any]:
    """
    Handler for get_qrank_distribution tool.
    Returns breakdown of publications by Q-rank (Q1/Q2/Q3/Q4).
    """
    log.info(f"[get_qrank_distribution] dept={department}")
    
    # Build department filter
    dept_filter = ""
    if department:
        dept_escaped = escape_sql(department)
        dept_filter = f"AND home_author_department ILIKE '%{dept_escaped}%'"
    
    sql = f"""
        SELECT 
            q_rank_scopus, 
            COUNT(*)::int AS cnt
        FROM publications
        WHERE q_rank_scopus IS NOT NULL {dept_filter}
        GROUP BY q_rank_scopus
        ORDER BY q_rank_scopus
    """
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    if len(rows) == 0:
        if department:
            return format_error(f"No Q-ranked publications found for department: {department}")
        return format_error("No Q-ranked publications found")
    
    total = sum(r["cnt"] for r in rows)
    
    distribution = [
        {
            "qrank": r["q_rank_scopus"],
            "count": r["cnt"],
            "percentage": round((r["cnt"] / total * 100), 1)
        } for r in rows
    ]
    
    return {
        "status": "success",
        "department": department,
        "total_ranked": total,
        "distribution": distribution
    }


def handle_count_qrank_publications(
    qrank: str, 
    department: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handler for count_qrank_publications tool.
    Counts publications in a specific Q-rank tier.
    """
    log.info(f"[count_qrank_publications] qrank={qrank}, dept={department}")
    
    # Validate Q-rank
    if qrank not in ["Q1", "Q2", "Q3", "Q4"]:
        return format_error(f"Invalid Q-rank: {qrank}. Must be Q1, Q2, Q3, or Q4")
    
    # Build department filter
    dept_filter = ""
    if department:
        dept_escaped = escape_sql(department)
        dept_filter = f"AND home_author_department ILIKE '%{dept_escaped}%'"
    
    sql = f"""
        SELECT COUNT(*)::int AS cnt
        FROM publications
        WHERE q_rank_scopus = '{qrank}' {dept_filter}
    """
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    count = rows[0]["cnt"] if rows else 0
    
    return {
        "status": "success",
        "qrank": qrank,
        "department": department,
        "count": count
    }


def handle_get_publication_trend(
    years: int = 5, 
    department: Optional[str] = None
) -> Dict[str, Any]:
    """
    Handler for get_publication_trend tool.
    Returns year-over-year publication counts with growth rates.
    """
    log.info(f"[get_publication_trend] years={years}, dept={department}")
    
    # Validate years parameter
    if years < 3 or years > 10:
        years = 5
    
    # Build department filter
    dept_filter = ""
    if department:
        dept_escaped = escape_sql(department)
        dept_filter = f"AND home_author_department ILIKE '%{dept_escaped}%'"
    
    # Get current year and calculate lookback
    current_year = 2026  # TODO: Make this dynamic
    start_year = current_year - years + 1
    
    sql = f"""
        SELECT 
            year, 
            COUNT(*)::int AS cnt
        FROM publications
        WHERE year >= {start_year} 
          AND year <= {current_year} 
          {dept_filter}
        GROUP BY year
        ORDER BY year DESC
    """
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    if len(rows) == 0:
        return format_error("No publication data found for the specified period")
    
    # Calculate year-over-year growth
    trend_data = []
    for i, row in enumerate(rows):
        year_data = {
            "year": row["year"],
            "count": row["cnt"],
            "growth_pct": None
        }
        
        # Calculate growth if there's a previous year
        if i < len(rows) - 1:
            prev_count = rows[i + 1]["cnt"]
            if prev_count > 0:
                growth = ((row["cnt"] - prev_count) / prev_count) * 100
                year_data["growth_pct"] = round(growth, 1)
        
        trend_data.append(year_data)
    
    return {
        "status": "success",
        "years": years,
        "department": department,
        "data": trend_data
    }


def handle_search_publications_by_author(
    author_name: str,
    year: Optional[int] = None,
    qrank: Optional[str] = None,
    limit: int = 10
) -> Dict[str, Any]:
    """
    Handler for search_publications_by_author tool.
    Returns list of publications by a specific author.
    """
    log.info(f"[search_publications_by_author] author={author_name}, year={year}, qrank={qrank}, limit={limit}")
    
    # Validate limit
    if limit < 1 or limit > 50:
        limit = 10
    
    name_escaped = escape_sql(author_name)
    
    # Build optional filters
    filters = [f"home_authors ILIKE '%{name_escaped}%'"]
    
    if year:
        filters.append(f"year = {year}")
    
    if qrank:
        if qrank not in ["Q1", "Q2", "Q3", "Q4"]:
            return format_error(f"Invalid Q-rank: {qrank}. Must be Q1, Q2, Q3, or Q4")
        filters.append(f"q_rank_scopus = '{qrank}'")
    
    where_clause = " AND ".join(filters)
    
    sql = f"""
        SELECT 
            title,
            year,
            source_publication,
            article_type,
            q_rank_scopus,
            scs_citations,
            doi
        FROM publications
        WHERE {where_clause}
        ORDER BY scs_citations DESC NULLS LAST, year DESC
        LIMIT {limit}
    """
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    if len(rows) == 0:
        return {
            "status": "no_match",
            "message": f"No publications found for author: {author_name}"
        }
    
    publications = [
        {
            "title": r["title"],
            "year": r["year"],
            "source": r["source_publication"],
            "type": r["article_type"],
            "qrank": r["q_rank_scopus"],
            "citations": r["scs_citations"] or 0,
            "doi": r["doi"]
        } for r in rows
    ]
    
    return {
        "status": "success",
        "author": author_name,
        "count": len(publications),
        "data": publications
    }


def handle_execute_sql(sql: str) -> Dict[str, Any]:
    """
    Handler for execute_sql fallback tool.
    Executes custom SQL with minimal validation.
    """
    log.info(f"[execute_sql] Executing custom SQL")
    log.debug(f"SQL: {sql[:200]}...")
    
    # Security check: only SELECT allowed
    if not sql.strip().lower().startswith("select"):
        return format_error("Only SELECT queries are allowed for security reasons")
    
    rows = execute_sql(sql)
    
    err = check_db_error(rows)
    if err:
        return err
    
    # Truncate large results
    truncated = rows[:10] if len(rows) > 10 else rows
    
    return {
        "status": "success",
        "rows_returned": len(rows),
        "rows_shown": len(truncated),
        "truncated": len(rows) > 10,
        "data": truncated
    }


## Handler Dispatch Map

```python
HANDLERS = {
    "get_faculty_stats": handle_get_faculty_stats,
    "list_top_faculty": handle_list_top_faculty,
    "get_department_stats": handle_get_department_stats,
    "count_publications_by_year": handle_count_publications_by_year,
    "get_qrank_distribution": handle_get_qrank_distribution,
    "count_qrank_publications": handle_count_qrank_publications,
    "get_publication_trend": handle_get_publication_trend,
    "search_publications_by_author": handle_search_publications_by_author,
    "execute_sql": handle_execute_sql
}
```
