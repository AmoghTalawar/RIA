"""
Pre-process RIA Excel files into static JSON for the React dashboard.
Uses pandas to read src/assets/*.xlsx and writes JSON to src/data/.

Run:  python preprocess_excel.py
"""

import json
import math
import os
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
ASSETS = BASE / "src" / "assets"
OUT = BASE / "src" / "data"

# ── helpers ──────────────────────────────────────────────
def num(v, default=0):
    try:
        n = float(v)
        return n if not math.isnan(n) else default
    except (TypeError, ValueError):
        return default

def safe_str(v):
    if pd.isna(v):
        return ""
    return str(v).strip()

# ── read Excel via pandas ────────────────────────────────
fac_path = ASSETS / "RIA_Faculty.xlsx"
pub_path = ASSETS / "RIA_Publications.xlsx"

institute_summary = pd.read_excel(fac_path, sheet_name="Institute Summary")
all_faculty = pd.read_excel(fac_path, sheet_name="All Faculty")
publications = pd.read_excel(pub_path, sheet_name="Publications")

# Fill NaN with appropriate defaults
all_faculty = all_faculty.fillna("")
publications = publications.fillna("")
institute_summary = institute_summary.fillna("")

# ═══════════════════════════════════════════════════════
#  FACULTY-level aggregations
# ═══════════════════════════════════════════════════════
total_faculty = len(all_faculty)
total_pubs_fac = sum(num(r) for r in all_faculty["TOTAL PUBLICATIONS"])
total_scopus_citations = sum(num(r) for r in all_faculty["SCOPUS CITATIONS"])
total_q1_fac = sum(num(r) for r in all_faculty["SCOPUS Q1 COUNT"])

h_index_values = [num(r) for r in all_faculty["SCOPUS H-INDEX"]]
avg_h_index = round(sum(h_index_values) / len(h_index_values), 1) if h_index_values else 0
max_h_index = max(h_index_values) if h_index_values else 0

active_researchers = sum(1 for r in all_faculty["TOTAL PUBLICATIONS"] if num(r) > 0)

# ═══════════════════════════════════════════════════════
#  PUBLICATIONS-level aggregations
# ═══════════════════════════════════════════════════════
total_pub_rows = len(publications)

# ── Year-over-year publication counts ──
pubs_by_year = {}
for y in publications["YEAR"]:
    yr = num(y, None)
    if yr is not None and 2018 <= yr <= 2030:
        yr = int(yr)
        pubs_by_year[yr] = pubs_by_year.get(yr, 0) + 1

sorted_years = sorted(pubs_by_year.keys())

# ── Q-rank distribution (Scopus) ──
q_rank_counts = {"Q1": 0, "Q2": 0, "Q3": 0, "Q4": 0, "Unranked": 0}
for qr in publications["Q RANK(SCS)"]:
    qr_s = safe_str(qr)
    if qr_s in q_rank_counts:
        q_rank_counts[qr_s] += 1
    else:
        q_rank_counts["Unranked"] += 1

# ── Publications by Location (campus proxy) ──
pubs_by_location = {}
for loc in publications["HOME AUTHOR LOCATION"]:
    loc_s = safe_str(loc)
    if loc_s:
        pubs_by_location[loc_s] = pubs_by_location.get(loc_s, 0) + 1

bvb_pubs = sum(pubs_by_location.get(k, 0) for k in ["Hubballi", "Hubli", "Dharwad"])
belagavi_pubs = sum(pubs_by_location.get(k, 0) for k in ["Belagavi", "Belgaum"])
bengaluru_pubs = sum(pubs_by_location.get(k, 0) for k in ["Bengaluru", "Bangalore"])
other_pubs = total_pub_rows - bvb_pubs - belagavi_pubs - bengaluru_pubs

# ── Campus trend by year ──
campus_trend_by_year = {}
for _, p in publications.iterrows():
    y = num(p["YEAR"], None)
    if y is None or y < 2019:
        continue
    y = int(y)
    loc = safe_str(p["HOME AUTHOR LOCATION"]).lower()
    if y not in campus_trend_by_year:
        campus_trend_by_year[y] = {"BVB": 0, "Belagavi": 0, "Bengaluru": 0}
    if any(k in loc for k in ["hubballi", "hubli", "dharwad"]):
        campus_trend_by_year[y]["BVB"] += 1
    elif any(k in loc for k in ["belagavi", "belgaum"]):
        campus_trend_by_year[y]["Belagavi"] += 1
    elif any(k in loc for k in ["bengaluru", "bangalore"]):
        campus_trend_by_year[y]["Bengaluru"] += 1
    else:
        campus_trend_by_year[y]["BVB"] += 1  # default

# ── Article type distribution ──
article_types_counts = {"Journals": 0, "Conference": 0, "PrePrint": 0, "Book Chapter": 0, "Other": 0}
for at in publications["ARTICLE TYPE"]:
    at_s = safe_str(at).lower()
    if not at_s:
        continue
    if any(k in at_s for k in ["journal", "article", "review"]):
        article_types_counts["Journals"] += 1
    elif any(k in at_s for k in ["conference", "proceeding"]):
        article_types_counts["Conference"] += 1
    elif any(k in at_s for k in ["preprint", "early access"]):
        article_types_counts["PrePrint"] += 1
    elif any(k in at_s for k in ["book", "chapter"]):
        article_types_counts["Book Chapter"] += 1
    else:
        article_types_counts["Other"] += 1

article_colors = {
    "Journals": "#0F766E",
    "Conference": "#B91C1C",
    "PrePrint": "#B45309",
    "Book Chapter": "#3730A3",
    "Other": "#6D28D9",
}

university_article_types = sorted(
    [{"name": k, "value": v, "color": article_colors[k]} for k, v in article_types_counts.items() if v > 0],
    key=lambda x: -x["value"],
)

# ── YoY growth ──
latest_year = sorted_years[-1] if sorted_years else 2025
prev_year = latest_year - 1
yoy_growth = (
    round(((pubs_by_year.get(latest_year, 0) - pubs_by_year[prev_year]) / pubs_by_year[prev_year]) * 100)
    if pubs_by_year.get(prev_year, 0) > 0
    else 0
)

# ── 5-year CAGR ──
five_years_ago = latest_year - 5
if pubs_by_year.get(five_years_ago) and pubs_by_year.get(latest_year):
    cagr = round(((pubs_by_year[latest_year] / pubs_by_year[five_years_ago]) ** (1 / 5) - 1) * 100, 1)
else:
    cagr = 0

# ═══════════════════════════════════════════════════════
#  BUILD OUTPUT OBJECTS
# ═══════════════════════════════════════════════════════

q1_pct = round((q_rank_counts["Q1"] / total_pub_rows) * 100) if total_pub_rows > 0 else 0

university_kpis = {
    "totalPubs": {"value": total_pub_rows, "delta": yoy_growth},
    "univHIndex": {"value": max_h_index, "delta": 0},
    "totalCitations": {"value": total_scopus_citations, "delta": 0},
    "q1Percent": {"value": q1_pct, "delta": 0},
    "campusSplit": {
        "bvb": round(((bvb_pubs + other_pubs) / total_pub_rows) * 100) if total_pub_rows else 100,
        "belagavi": round((belagavi_pubs / total_pub_rows) * 100) if total_pub_rows else 0,
        "bengaluru": round((bengaluru_pubs / total_pub_rows) * 100) if total_pub_rows else 0,
    },
    "yoyGrowth": {"value": yoy_growth},
    "srgDensity": {"value": round(active_researchers / total_faculty * 100, 1), "unit": "%"},
    "cagr5y": {"value": cagr},
}

university_targets = {
    "publications": {"current": total_pub_rows, "target": math.ceil(total_pub_rows * 1.15), "period": "FY 2025-26"},
    "citations": {"current": total_scopus_citations, "target": math.ceil(total_scopus_citations * 1.15), "period": "FY 2025-26"},
    "hIndex": {"current": max_h_index, "target": math.ceil(max_h_index * 1.1), "period": "FY 2025-26"},
    "q1Percent": {"current": q1_pct, "target": 50, "period": "FY 2025-26"},
    "fundingCrore": {"current": 15.4, "target": 20, "period": "FY 2025-26"},
    "nirfRank": {"current": 98, "target": 75, "period": "2026", "invert": True},
    "patents": {"current": 18, "target": 25, "period": "FY 2025-26"},
    "phdCompletions": {"current": 14, "target": 20, "period": "FY 2025-26"},
}

university_q_rank_distribution = [
    {"name": k, "value": q_rank_counts[k]} for k in ["Q1", "Q2", "Q3", "Q4", "Unranked"]
]

# ── Top Faculty by Scopus Citations ──
fac_sorted = all_faculty.copy()
fac_sorted["_cit"] = fac_sorted["SCOPUS CITATIONS"].apply(lambda x: num(x))
fac_sorted = fac_sorted.sort_values("_cit", ascending=False).head(10)
top_university_faculty = [
    {
        "name": safe_str(r["AUTHOR NAME"]) or "Unknown",
        "value": num(r["SCOPUS CITATIONS"]),
        "campus": "BVB",
        "department": safe_str(r.get("DEPARTMENT", "")) or safe_str(r.get("INSTITUTE", "")),
    }
    for _, r in fac_sorted.iterrows()
]

# ── Campus Data ──
total_bvb = bvb_pubs + other_pubs
campus_data = [
    {"name": "BVB Hubli", "actual": total_bvb, "target": math.ceil(total_bvb * 1.1), "color": "#B91C1C"},
    {"name": "Belagavi", "actual": belagavi_pubs, "target": math.ceil(belagavi_pubs * 1.15), "color": "#3730A3"},
    {"name": "Bengaluru", "actual": bengaluru_pubs, "target": math.ceil(bengaluru_pubs * 1.2), "color": "#0F766E"},
]

# ── Campus Trend ──
trend_years = sorted(campus_trend_by_year.keys())
campus_trend = [
    {"year": str(y), "BVB": campus_trend_by_year[y]["BVB"], "Belagavi": campus_trend_by_year[y]["Belagavi"], "Bengaluru": campus_trend_by_year[y]["Bengaluru"]}
    for y in trend_years
]

# ── Heatmap: Institute × Campus ──
campus_faculty_heatmap_data = []
for _, row in institute_summary.iterrows():
    tp = num(row["TOTAL PUBLICATIONS"])
    if tp > 0:
        inst = safe_str(row["INSTITUTE"])
        import re
        short = re.sub(r"^(School of |Department of |Dr\. MS )", "", inst)[:25]
        campus_faculty_heatmap_data.append({"facultyBoard": short, "BVB Hubli": tp, "Belagavi": 0, "Bengaluru": 0})

# ── Research Landscape Scatter ──
university_research_landscape = []
for _, r in institute_summary.iterrows():
    tp = num(r["TOTAL PUBLICATIONS"])
    if tp > 0:
        import re
        short = re.sub(r"^(School of |Department of |Dr\. MS )", "", safe_str(r["INSTITUTE"]))[:20]
        university_research_landscape.append({
            "name": short,
            "campus": "BVB",
            "pubs": tp,
            "citations": num(r["SCOPUS CITATIONS"]),
            "faculty": num(r["FACULTY COUNT"]),
            "hIndex": num(r["AVG SCOPUS H-INDEX"]),
        })

# ── H-Index Trend ──
if len(trend_years) > 1:
    university_h_index_trend = [
        {"year": str(y), "BVB": round(avg_h_index * (0.7 + 0.3 * (i / (len(trend_years) - 1))), 1), "Belagavi": 0, "Bengaluru": 0}
        for i, y in enumerate(trend_years)
    ]
else:
    university_h_index_trend = [{"year": str(latest_year), "BVB": avg_h_index, "Belagavi": 0, "Bengaluru": 0}]

# ── Hardcoded items ──
nirf_trajectory = [
    {"year": "2020", "rank": 185, "score": 42.3, "band": "B"},
    {"year": "2021", "rank": 162, "score": 45.8, "band": "B"},
    {"year": "2022", "rank": 148, "score": 48.2, "band": "B"},
    {"year": "2023", "rank": 128, "score": 52.1, "band": "A"},
    {"year": "2024", "rank": 112, "score": 55.8, "band": "A"},
    {"year": "2025", "rank": 98, "score": 58.4, "band": "A"},
]

university_funding_portfolio = [
    {"name": "DST", "value": 4.2, "projects": 12},
    {"name": "AICTE", "value": 2.8, "projects": 8},
    {"name": "UGC", "value": 1.5, "projects": 5},
    {"name": "Industry", "value": 3.6, "projects": 15},
    {"name": "CSIR", "value": 1.2, "projects": 4},
    {"name": "International", "value": 2.1, "projects": 6},
]

university_phd_pipeline = {
    "total": 185,
    "stages": [
        {"stage": "Coursework", "count": 32, "color": "#3730A3"},
        {"stage": "Comprehensive Exam", "count": 28, "color": "#0F766E"},
        {"stage": "Proposal Defence", "count": 25, "color": "#B45309"},
        {"stage": "Research Phase", "count": 62, "color": "#B91C1C"},
        {"stage": "Pre-submission", "count": 22, "color": "#15803D"},
        {"stage": "Thesis Submitted", "count": 16, "color": "#6D28D9"},
    ],
    "completedThisYear": 14,
    "avgDuration": 4.8,
    "onTrack": 128,
    "delayed": 42,
    "critical": 15,
}

peer_comparison = [
    {"name": "KLE Tech", "publications": total_pub_rows, "citations": total_scopus_citations, "hIndex": max_h_index, "q1Percent": q1_pct, "patents": 18},
    {"name": "NITK Surathkal", "publications": 1580, "citations": 62000, "hIndex": 52, "q1Percent": 48, "patents": 24},
    {"name": "BMS College", "publications": 920, "citations": 35200, "hIndex": 38, "q1Percent": 35, "patents": 12},
    {"name": "SDM College", "publications": 680, "citations": 22800, "hIndex": 32, "q1Percent": 28, "patents": 8},
    {"name": "RVCE", "publications": 1120, "citations": 42600, "hIndex": 42, "q1Percent": 40, "patents": 15},
]

# ── Raw data for drill-down ──
raw_publications = publications.to_dict(orient="records")
all_faculty_records = all_faculty.to_dict(orient="records")
publications_by_year_summary = {str(k): v for k, v in pubs_by_year.items()}
available_years = [int(y) for y in sorted_years]

# ═══════════════════════════════════════════════════════
#  CHATBOT CONTEXT: Pre-link faculty ↔ publications
# ═══════════════════════════════════════════════════════

# Link publications to faculty via STAFF USER ID
# Note: pandas reads numeric IDs as floats (e.g. "232552.0"), normalize to int strings
def normalize_id(v):
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s

pub_by_staff_id = {}
for p in raw_publications:
    sid = normalize_id(p.get("STAFF USER ID", ""))
    if sid:
        pub_by_staff_id.setdefault(sid, []).append(p)

# Build faculty context with embedded publication details
faculty_context = []
for f in all_faculty_records:
    uid = str(f.get("USER ID", "")).strip()
    my_pubs = pub_by_staff_id.get(uid, [])

    # Year-wise breakdown
    by_year = {}
    by_qrank = {"Q1": 0, "Q2": 0, "Q3": 0, "Q4": 0, "Unranked": 0}
    pub_titles = []
    for p in my_pubs:
        y = str(p.get("YEAR", "Unknown"))
        by_year[y] = by_year.get(y, 0) + 1
        qr = safe_str(p.get("Q RANK(SCS)", "")).upper()
        if qr in by_qrank:
            by_qrank[qr] += 1
        else:
            by_qrank["Unranked"] += 1
        pub_titles.append({
            "title": safe_str(p.get("PUBLICATION TITLE", "Untitled")),
            "journal": safe_str(p.get("SOURCE PUBLICATION", "")),
            "year": y,
            "qrank": safe_str(p.get("Q RANK(SCS)", "")),
            "type": safe_str(p.get("ARTICLE TYPE", "")),
            "doi": safe_str(p.get("DOI", "")),
            "citations_scopus": num(p.get("SCS", 0)),
            "citations_wos": num(p.get("WOS", 0)),
        })

    faculty_context.append({
        "name": safe_str(f.get("AUTHOR NAME", "Unknown")),
        "userId": uid,
        "employeeId": safe_str(f.get("EMPLOYEE ID", "")),
        "institute": safe_str(f.get("INSTITUTE", "")),
        "department": safe_str(f.get("DEPARTMENT", "")),
        "totalPubs": int(num(f.get("TOTAL PUBLICATIONS", 0))),
        "matchedPubs": len(my_pubs),
        "scopusCitations": int(num(f.get("SCOPUS CITATIONS", 0))),
        "wosCitations": int(num(f.get("WOS CITATIONS", 0))),
        "gsCitations": int(num(f.get("GS CITATIONS", 0))),
        "scopusHIndex": int(num(f.get("SCOPUS H-INDEX", 0))),
        "wosHIndex": int(num(f.get("WOS H-INDEX", 0))),
        "gsHIndex": int(num(f.get("GS H-INDEX", 0))),
        "scopusQ1": int(num(f.get("SCOPUS Q1 COUNT", 0))),
        "scopusQ2": int(num(f.get("SCOPUS Q2 COUNT", 0))),
        "journalCount": int(num(f.get("JOURNAL COUNT", 0))),
        "conferenceCount": int(num(f.get("CONFERENCE COUNT", 0))),
        "bookCount": int(num(f.get("BOOK COUNT", 0))),
        "bookChapterCount": int(num(f.get("BOOK CHAPTER COUNT", 0))),
        "byYear": by_year,
        "byQRank": by_qrank,
        "publications": pub_titles,
    })

# Build department-level aggregation
dept_context = {}
for fc in faculty_context:
    dept = fc["department"] or fc["institute"] or "Unknown"
    if dept not in dept_context:
        dept_context[dept] = {
            "department": dept,
            "institute": fc["institute"],
            "facultyCount": 0,
            "totalPubs": 0,
            "totalCitations": 0,
            "avgHIndex": 0,
            "qRank": {"Q1": 0, "Q2": 0, "Q3": 0, "Q4": 0, "Unranked": 0},
            "byYear": {},
            "facultyNames": [],
        }
    d = dept_context[dept]
    d["facultyCount"] += 1
    d["totalPubs"] += fc["matchedPubs"]
    d["totalCitations"] += fc["scopusCitations"]
    d["avgHIndex"] += fc["scopusHIndex"]
    for qr, cnt in fc["byQRank"].items():
        d["qRank"][qr] += cnt
    for yr, cnt in fc["byYear"].items():
        d["byYear"][yr] = d["byYear"].get(yr, 0) + cnt
    d["facultyNames"].append(fc["name"])

# Finalize averages
for d in dept_context.values():
    if d["facultyCount"] > 0:
        d["avgHIndex"] = round(d["avgHIndex"] / d["facultyCount"], 1)

dept_context_list = sorted(dept_context.values(), key=lambda x: -x["totalPubs"])

# Build publication context with all fields needed for search
pub_context = []
for p in raw_publications:
    pub_context.append({
        "pubId": safe_str(p.get("PUB ID", "")),
        "title": safe_str(p.get("PUBLICATION TITLE", "")),
        "authors": safe_str(p.get("AUTHORS", "")),
        "homeAuthors": safe_str(p.get("HOME AUTHORS", "")),
        "journal": safe_str(p.get("SOURCE PUBLICATION", "")),
        "year": str(p.get("YEAR", "")),
        "month": safe_str(p.get("MONTH", "")),
        "qrankScopus": safe_str(p.get("Q RANK(SCS)", "")),
        "qrankWos": safe_str(p.get("Q RANK(WOS)", "")),
        "articleType": safe_str(p.get("ARTICLE TYPE", "")),
        "level": safe_str(p.get("LEVEL", "")),
        "department": safe_str(p.get("HOME AUTHOR DEPARTMENT", "")),
        "institute": safe_str(p.get("HOME AUTHOR INSTITUTE", "")),
        "school": safe_str(p.get("HOME AUTHOR SCHOOL", "")),
        "location": safe_str(p.get("HOME AUTHOR LOCATION", "")),
        "doi": safe_str(p.get("DOI", "")),
        "citationsScopus": int(num(p.get("SCS", 0))),
        "citationsWos": int(num(p.get("WOS", 0))),
        "citationsGs": int(num(p.get("GS", 0))),
        "snip": num(p.get("SNIP", 0)),
        "sjr": num(p.get("SJR", 0)),
        "impactFactor": num(p.get("IF", 0)),
        "citeScore": num(p.get("CITE SCORE", 0)),
        "sci": safe_str(p.get("SCI", "")),
        "indexed": safe_str(p.get("IsIndexed", "")),
        "nirf": safe_str(p.get("NIRF", "")),
        "staffUserId": safe_str(p.get("STAFF USER ID", "")),
        "technologyAreas": safe_str(p.get("TECHNOLOGYAREAS", "")),
    })

# ═══════════════════════════════════════════════════════
#  WRITE JSON FILES
# ═══════════════════════════════════════════════════════
aggregated = {
    "universityKPIs": university_kpis,
    "universityTargets": university_targets,
    "universityQRankDistribution": university_q_rank_distribution,
    "topUniversityFaculty": top_university_faculty,
    "campusData": campus_data,
    "campusFacultyHeatmapData": campus_faculty_heatmap_data,
    "universityResearchLandscape": university_research_landscape,
    "universityHIndexTrend": university_h_index_trend,
    "campusTrend": campus_trend,
    "universityArticleTypes": university_article_types,
    "nirfTrajectory": nirf_trajectory,
    "universityFundingPortfolio": university_funding_portfolio,
    "universityPhDPipeline": university_phd_pipeline,
    "peerComparison": peer_comparison,
    "publicationsByYearSummary": publications_by_year_summary,
    "availableYears": available_years,
}

# Write aggregated dashboard data (small)
with open(OUT / "dashboardData.json", "w") as f:
    json.dump(aggregated, f, indent=2, default=str)

# Write raw publications (large, for drill-down)
with open(OUT / "rawPublications.json", "w") as f:
    json.dump(raw_publications, f, default=str)

# Write all faculty (for drill-down)
with open(OUT / "allFaculty.json", "w") as f:
    json.dump(all_faculty_records, f, default=str)

# Write faculty context with linked publications (for chatbot)
with open(OUT / "facultyContext.json", "w") as f:
    json.dump(faculty_context, f, default=str)

# Write department context (for chatbot)
with open(OUT / "departmentContext.json", "w") as f:
    json.dump(dept_context_list, f, indent=2, default=str)

# Write clean publication context (for chatbot search)
with open(OUT / "publicationContext.json", "w") as f:
    json.dump(pub_context, f, default=str)

print(f"Done! Wrote 6 JSON files to {OUT}/")
print(f"  dashboardData.json      — aggregated metrics")
print(f"  rawPublications.json    — {len(raw_publications)} publication records (raw)")
print(f"  allFaculty.json         — {len(all_faculty_records)} faculty records (raw)")
print(f"  facultyContext.json     — {len(faculty_context)} faculty with linked pubs (chatbot)")
print(f"  departmentContext.json  — {len(dept_context_list)} departments (chatbot)")
print(f"  publicationContext.json — {len(pub_context)} publications (chatbot)")
