# RIA Chat — Token Budget

How many tokens a question to the RIA research chatbot consumes, split into five parts, and how the
models compare.

| | Part | What it is |
|---|---|---|
| **Input** | 1. System prompt | Routing instructions, answer rules and session context (today's date, newest data year) |
| | 2. Tools | The JSON definition of every tool the role may use |
| | 3. Persona | The role's voice, rules and scope (plus the user's name and department) |
| **Output** | 4. Tool output | What the tools return (database results); added to the model's input on the next call |
| | 5. LLM output | The answer the model writes |

Token counts use the `o200k_base` tokenizer unless stated. Claude counts about **1.4×** as many tokens
for the same text (measured 1.38–1.47 per role).

---

## 1. Input tokens per call

Parts 1–3 are identical on every model call for a role. A question that calls a tool makes about two
model calls, so they are sent about twice.

| Role | Tools offered | System prompt | Tools | Persona | **Total input per call** | Claude Haiku 5.5 count (measured) |
|---|---:|---:|---:|---:|---:|---:|
| Faculty (L5) | 13 | 1,520 | 2,107 | 510 | **4,137** | 6,068 |
| HoD (L4) | 16 | 1,665 | 2,753 | 571 | **4,989** | 6,904 |
| Faculty Dean (L3) | 20 | 1,762 | 3,244 | 493 | **5,499** | 7,669 |
| Executive Dean (L2) | 18 | 1,723 | 3,125 | 506 | **5,354** | 7,415 |
| Vice Chancellor (L1) | 21 | 1,773 | 3,505 | 789 | **6,067** | 8,459 |
| **Average** | | **1,689** | **2,947** | **574** | **5,209** | **7,303** |
| Share of input | | 32% | 57% | 11% | 100% | |

Each role only receives the tools and routing rules it is allowed to use, so roles with more tools carry
more input. Tool definitions are the largest part; the persona is the smallest.

### 1.1 Tool definitions

Tokens each tool's definition adds to the input of every call.

| Tool | Tokens |
|---|---:|
| `search_publications_by_author` | 284 |
| `compare_entities` | 278 |
| `list_campus_publications` | 261 |
| `count_qrank_publications` | 242 |
| `get_top_journals` | 227 |
| `get_campus_top_authors` | 223 |
| `get_qrank_distribution` | 179 |
| `get_department_stats` | 170 |
| `get_department_trend` | 166 |
| `get_faculty_stats` | 147 |
| `get_inactive_faculty` | 145 |
| `get_author_concentration` | 145 |
| `get_top_cited_publications` | 143 |
| `get_campus_stats` | 136 |
| `get_yearly_stats` | 131 |
| `get_cross_department_collaboration` | 126 |
| `get_citations_by_year` | 113 |
| `get_institute_summary` | 111 |
| `get_growth_acceleration` | 109 |
| `get_department_benchmark` | 91 |
| `get_university_overview` | 77 |
| **All 21 tools** | **3,505** |

---

## 2. Output tokens

### 2.1 Tool output

Tokens each tool returns for a typical call (Computer Science and Engineering unless noted).

| Tool output | Tokens |
|---|---:|
| `get_qrank_distribution` | 63 |
| `get_author_concentration` | 83 |
| `get_faculty_stats` | 123 |
| `get_department_stats` (no names) | 134 |
| `get_department_trend` (5 years) | 139 |
| `get_university_overview` | 204 |
| `get_citations_by_year` | 239 |
| `get_department_stats` (top-5 names) | 281 |
| `get_inactive_faculty` (all departments: counts only) | 324 |
| `get_campus_top_authors` (top 10) | 325 |
| `get_top_journals` (10) | 359 |
| `get_campus_stats` (all 3 campuses) | 411 |
| `get_inactive_faculty` (one department, 24 months) | 609 |
| `get_institute_summary` (all schools) | 664 |
| `compare_entities` (institutes) | 703 |
| `get_top_cited_publications` | 728 |
| `list_campus_publications` (default 15) | 753 |
| `compare_entities` (10 departments) | 780 |
| `search_publications_by_author` (10 papers) | 805 |
| `list_campus_publications` (30, the cap) | 1,397 |
| `compare_entities` (30 departments) | 2,179 |

Across these 21 results the **average is about 540 tokens and the median about 360**. The largest are
whole-university rankings and long paper lists.

### 2.2 LLM output

| Item | Tokens |
|---|---:|
| Average per question, Claude Haiku 5.5 (66 requests) | **879** |
| Average per question, gpt-oss-120b (earlier sample) | ~240 |
| Average per question, Gemini 3.5 Flash (earlier sample) | ~165, plus ~1,040 hidden thinking tokens |
| Largest single answer observed | 4,181 |
| Reserved per call (`LLM_MAX_TOKENS`) | 1,800 |

Claude writes the longest answers; ranking tables produce 1,700–1,800 tokens.

---

## 3. Average tokens per question

Measured on **Claude Haiku 5.5** over 66 logged requests (internal testing). Input is parts 1–3 resent on
each call plus tool output and history; output is the model's answer.

| Role | Requests | Total tokens | Avg input | Avg output | **Avg total** |
|---|---:|---:|---:|---:|---:|
| Faculty (L5) | 12 | 144,112 | 11,379 | 630 | **12,009** |
| HoD (L4) | 13 | 210,618 | 15,222 | 979 | **16,201** |
| Faculty Dean (L3) | 12 | 199,586 | 15,781 | 851 | **16,632** |
| Executive Dean (L2) | 12 | 184,271 | 14,601 | 755 | **15,356** |
| Vice Chancellor (L1) | 17 | 326,528 | 18,121 | 1,087 | **19,208** |
| **All roles** | **66** | **1,065,115** | **15,259** | **879** | **16,138** |

| Measure | Value |
|---|---:|
| Input share of all tokens | 94.6% |
| Output share of all tokens | 5.4% |
| Average model calls per question | 1.8 |
| Average, questions that call a tool (49) | 18,853 |
| Average, questions answered without a tool (17) | 8,314 |
| Median / largest question | 16,933 / 43,464 |

### 3.1 Average tokens per question, by role and by part

Average tokens one question consumes, split into the five parts (Claude Haiku 5.5 counts; 28 most recent
requests, the ones that record the split). The system prompt, tools and persona figures are the per-call
input from §1 multiplied by the model calls the question made. The tool output column also includes the
tool-call messages, conversation history and the user's question, which are small next to the tool results.

| Role | Requests | Avg model calls | System prompt | Tools | Persona | Tool output | LLM output | **Avg total** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Faculty (L5) | 5 | 1.8 | 4,013 | 5,563 | 1,346 | 1,769 | 635 | **13,326** |
| HoD (L4) | 5 | 2.0 | 4,608 | 7,619 | 1,580 | 2,848 | 1,139 | **17,795** |
| Faculty Dean (L3) | 5 | 2.0 | 4,915 | 9,048 | 1,375 | 1,622 | 838 | **17,797** |
| Executive Dean (L2) | 5 | 2.0 | 4,773 | 8,656 | 1,402 | 2,768 | 978 | **18,576** |
| Vice Chancellor (L1) | 8 | 1.9 | 4,635 | 9,163 | 2,063 | 2,218 | 992 | **19,070** |
| **All roles** | **28** | **1.9** | **4,594** | **8,133** | **1,608** | **2,242** | **924** | **17,501** |


Reading the table:
- **Tools are the largest part for every role (47% on average)**, because the definitions are resent on
  each call. The Faculty role uses the fewest (5,563) and the Vice Chancellor the most (9,163).
- **System prompt, tools and persona together are 82% of an average question** (14,335 of 17,501 tokens).
  Tool output is 13% and the model's answer 5%.
- **Totals run from 13,326 (Faculty) to 19,070 (Vice Chancellor).** The gap comes mainly from the number
  of tools each role carries.

---

