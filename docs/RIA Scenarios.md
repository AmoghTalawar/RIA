# **RIA Scenarios** 

|**#**|**User Query**|**Why No Tools Needed**|
|---|---|---|
|**R1**|**"What is h-index and how is it calculated?"**|**Standard academic metric**<br>**definition**|
|**R2**|**"Which journals are top quartile for CS?"**|**Public journal ranking**<br>**knowledge**|
|**R3**|**"How do I improve my citation count?"**|**General academic advice**|
|**R4**|**"What is Scopus vs Web of Science?"**|**Public platform comparison**|
|**R5**|**"How does peer review work?"**|**Academic process**<br>**explanation**|



# **2. Tool Use — Single Call** 

**TOOL USE (SINGLE CALL)** 

**User asks about ONE specific data point from YOUR database. Claude recognizes it needs data, calls ONE tool function you defined, gets the result, and answers. This is the most common scenario (≈30% of queries).** 

|**#**|**User Query**|**Tool Function Called**|**Returns**|
|---|---|---|---|
|**R6**|**"How many papers did Dr.**<br>**Sharma publish this year?"**|**get_publications(faculty, year)**|**Publication count +**<br>**list**|
|**R7**|**"What’s CSE’s total h-**<br>**index?"**|**get_dept_metrics(dept)**|**Aggregated metrics**|
|**R8**|**"List all Scopus papers**<br>**from Belgaum campus"**|**get_publications(campus,**<br>**index)**|**Paper list**|
|**R9**|**"Faculty with zero**<br>**publications in 2 years?"**|**get_inactive_researchers(years**<br>**)**|**Faculty list**|



|**R1**<br>**0**|**"What is Dr. Kumar’s**<br>**citation count?"**|**get_faculty_metrics(faculty_id)**|**Citation stats**|
|---|---|---|---|
|**R1**<br>**1**|**"How many PhD students**<br>**are in ECE?"**|**get_phd_count(dept)**|**Count**|
|**R1**<br>**2**|**"List patents filed this**<br>**year"**|**get_patents(year)**|**Patent list**|



# **3. Tool Use — Chained Calls** 

# **TOOL USE (CHAINED — 2–5 CALLS)** 

**User asks a COMPARISON or TREND question that requires pulling data from multiple sources. Claude makes 2–5 tool calls in sequence within one conversation turn, then synthesizes the results into an answer. No framework needed — Claude’s API handles this natively.** 

# **RIA Scenarios** 

|**#**|**User Query**|**Tool Chain**|**Why Multiple**|
|---|---|---|---|
|**R1**<br>**3**|**"Compare research**<br>**output across 4**<br>**campuses"**|**get_metrics(campus1) → …**<br>**campus2 → …campus3 → …**<br>**campus4**|**One call per campus**|
|**R1**<br>**4**|**"Rank depts by**<br>**publications per faculty"**|**get_pubs(each_dept) →**<br>**get_faculty_count(each_dept)**<br>**→ calculate**|**Need both counts to**<br>**get ratio**|
|**R1**<br>**5**|**"Dr. Patil’s publication**<br>**trend over 5 years"**|**get_pubs(Patil, 2021) → …2022**<br>**→ …2025**|**One call per year**|
|**R1**<br>**6**|**"Which campus**<br>**improved most in**<br>**citations?"**|**get_citations(each, last_year) →**<br>**get_citations(each, this_year)**|**Before/after per**<br>**campus**|
|**R1**|**"Compare CS vs ECE**|**get_patents(CS) →**|**Side-by-side**|
|**7**|**patent filings"**|**get_patents(ECE)**|**comparison**|



# **Drill-Down Scenarios RIA Dashboard Drill Path** 

|**Level**|**User Action**|**What Shows**|**Technology**|
|---|---|---|---|
|**L0**|**Opens RIA dashboard**|**University-wide research**<br>**summary (4 campuses)**|**No AI — SQL**<br>**aggregation + chart**|
|**L1**|**Clicks Belgaum campus**|**Belgaum departments**<br>**ranked by publications**|**No AI — WHERE**<br>**campus=Belgaum**|
|**L2**|**Clicks CSE department**|**CSE faculty list with**<br>**publication counts**|**No AI — WHERE**<br>**campus=Belgaum AND**<br>**dept=CSE**|
|**L3**|**Clicks Dr. Sharma**|**Dr. Sharma’s full profile:**<br>**papers, h-index, citations**|**No AI — faculty profile**<br>**page**|
|**L4**|**Clicks a paper title**|**Full paper detail: abstract,**<br>**journal, co-authors, citations**|**No AI — record fetch**<br>**by ID**|



# **Type B: Conversational Drill-Down (Chat-Based)** 

**User asks follow-up questions in chat. Claude remembers previous answers because the full conversation history is included in every API call. No extra memory system needed. RIA Conversational Drill** 

|**#**|**Level**|**User Says**|**Technology**|**What Happens**|
|---|---|---|---|---|
|**R3**<br>**5**|**L0**|**"Compare**<br>**research output**<br>**across campuses"**|**Tool Use**<br>**(chained)**|**Claude calls get_metrics() for each**<br>**campus → comparison table**|
|**R3**<br>**6**|**L1**|**"Zoom into**<br>**Belgaum"**|**Tool Use (single)**|**Claude calls**<br>**get_dept_metrics(campus=Belgaum)**<br>**→ department breakdown**|
|**R3**<br>**7**|**L2**|**"Who published**<br>**the most there?"**|**Claude API Alone**|**Claude picks the top researcher**<br>**from data already in context**|



|**R3**<br>**8**|**L3**|**"Show me their**<br>**papers"**|**Tool Use (single)**|**Claude calls**<br>**get_publications(faculty_id=...)**<br>**using ID from L2 context**|
|---|---|---|---|---|



# **Type C: Hybrid Drill-Down (Dashboard → Chat)** 

**User sees something in a dashboard, clicks “Ask AI about this”, and the chat opens with pre-filled context. This bridges the no-AI dashboard world with the AI chat world.** 

# **RIA Hybrid Drill Scenarios** 

|**#**|**Dashboard Trigger**|**Chat Opens With**|**User Asks**|
|---|---|---|---|
|**R4**<br>**0**|**ECE publications**<br>**declining 3 years**|**"ECE publications:**<br>**45 (2023) → 38**<br>**(2024) → 29**<br>**(2025)."**|**"Why? Suggest**<br>**a strategy."**|
|**R4**<br>**1**|**Faculty with 0**<br>**publications**<br>**highlighted**|**"Dr. X has 0**<br>**Scopus**<br>**publications in 24**<br>**months."**|**"Check Google**<br>**Scholar too"**|
|**R4**<br>**2**|**Overlap detected**<br>**between 2 faculty**|**"Dr. A and Dr. B**<br>**both publish on**<br>**NLP for**<br>**healthcare."**|**"Should they**<br>**collaborate?**<br>**On what?"**|







# **Drill-Down Summary** 

|**Type**|**How User Drills**|**AI Involved?**|**What You Build**|
|---|---|---|---|
|**Type A:**<br>**Dashboard**|**Clicks chart elements**|**No**|**Frontend onClick handlers**<br>**+ SQL filters**|
|**Type B:**<br>**Conversational**|**Asks follow-up**<br>**questions in chat**|**Yes**|**Nothing extra —**<br>**conversation memory is**<br>**automatic**|
|**Type C: Hybrid**|**Clicks “Ask AI” from**|**Yes**|**One button + context**|



||**dashboard**||**injection into system**<br>**prompt**|
|---|---|---|---|
|**Time-based**|**Narrows time window**<br>**progressively**|**Yes**|**Same tools, different time**<br>**parameters**|



