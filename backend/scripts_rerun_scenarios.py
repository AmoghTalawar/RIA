"""Re-run the reviewer's scenario sheet against the real backend (real login, real LLM) and save it in the
same layout as docs/Scenario Wise Claude Response.xlsx.

Q01-Q12 are independent questions: each is asked in a NEW chat (empty history).
Q13-Q16 are the "Conversational Drill-Down": one chat per role, history carried between the four turns.

Usage (from backend/):  python scripts_rerun_scenarios.py [output.xlsx]
Makes up to 80 LLM questions (16 questions x 5 roles). Every answer is saved the moment it arrives
(rerun_checkpoint.json + the spreadsheet), and a restart skips answers already saved.
NEVER run this without the user's permission: it calls the LLM.
"""
import json
import sys
import time
from pathlib import Path

import httpx
import openpyxl
from dotenv import load_dotenv
from openpyxl.styles import Alignment, Font

load_dotenv(Path(__file__).parent / ".env")

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

URL = "http://127.0.0.1:55321"
ANON = None
for line in (Path(__file__).parent.parent / ".env").read_text(encoding="utf-8").splitlines():
    if line.startswith("VITE_SUPABASE_ANON_KEY="):
        ANON = line.split("=", 1)[1].strip()
PASSWORD = "KLE@2026"

# (sheet code, title, email)
ROLES = [
    ("L1", "Vice Chancellor", "uma.mudengudi@kletech.ac.in"),
    ("L2", "Executive Dean", "tewari.pg@kletech.ac.in"),
    ("L3", "Cluster Head", "vijayalaxmi.m@kletech.ac.in"),
    ("L4", "Head of Department", "narayan.dg@kletech.ac.in"),
    ("L5", "Faculty Member", "uday.kulkarni@kletech.ac.in"),
]

INDEPENDENT = [
    ("Q01", "What is h-index and how is it calculated?", "LLM"),
    ("Q02", "Which journals are top quartile for CS?", "LLM"),
    ("Q03", "How do I improve my citation count?", "LLM"),
    ("Q04", "How does peer review work?", "LLM"),
    ("Q05", "How many papers did Meena Maralappanavar S publish this year?", "Single Tool Call"),
    ("Q06", "What’s CSE’s total h-index?", "Single Tool Call"),
    ("Q07", "Faculty with zero publications in 2 years?", "Single Tool Call"),
    ("Q08", "What is Shrinivas Desai  citation count?", "Single Tool Call"),
    ("Q09", "Compare research output across 3 campuses", "Tool Use – Chained Calls"),
    ("Q10", "Rank depts by publications per faculty", "Tool Use – Chained Calls"),
    ("Q11", "Sunil Gurlahosur trend over 5 years", "Tool Use – Chained Calls"),
    ("Q12", "Which campus improved most in citations?", "Tool Use – Chained Calls"),
]
DRILL_DOWN = [
    ("Q13", "Compare research output across campuses", "Conversational Drill-Down"),
    ("Q14", "Zoom into Belgaum", "Conversational Drill-Down"),
    ("Q15", "Who hast the most publications there?", "Conversational Drill-Down"),
    ("Q16", "Show me his papers", "Conversational Drill-Down"),
]


def sign_in(email):
    r = httpx.post(f"{URL}/auth/v1/token?grant_type=password",
                   headers={"apikey": ANON, "Content-Type": "application/json"},
                   json={"email": email, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def ask(client, token, message, history):
    for attempt in range(3):
        r = client.post("/chat", headers={"Authorization": f"Bearer {token}"},
                        json={"message": message, "history": history})
        if r.status_code == 200:
            return r.json()["reply"]
        time.sleep(5 * (attempt + 1))
    return f"[ERROR {r.status_code}] {r.text[:300]}"


CHECKPOINT = Path(__file__).parent / "rerun_checkpoint.json"   # {"Q01|L1": reply, ...}; delete it to start over


def write_workbook(results, out_path):
    """Write every answer collected so far (missing ones stay blank) in the reviewer's layout."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Scenario Wise Responses"
    ws.append(["#", "Query ID", "Query", "Role", "Role Title", "Response", "Question Type"])
    n = 0
    for qid, text, qtype in INDEPENDENT + DRILL_DOWN:
        for code, title, _ in ROLES:
            n += 1
            ws.append([n, qid, text, code, title, results.get(f"{qid}|{code}", ""), qtype])
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for col, width in zip("ABCDEFG", (5, 10, 34, 7, 18, 128, 24)):
        ws.column_dimensions[col].width = width
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "D2"
    wb.save(out_path)


def main_run(out_path):
    results = json.loads(CHECKPOINT.read_text(encoding="utf-8")) if CHECKPOINT.exists() else {}
    todo = sum(1 for qid, _, _ in INDEPENDENT + DRILL_DOWN for code, _, _ in ROLES if f"{qid}|{code}" not in results)
    print(f"{len(results)} answers already saved; {todo} LLM question(s) to run", flush=True)
    if not todo:
        write_workbook(results, out_path)
        return

    client = TestClient(main.app)
    tokens = {code: sign_in(email) for code, _, email in ROLES}

    def record(qid, code, reply):
        results[f"{qid}|{code}"] = reply
        CHECKPOINT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
        write_workbook(results, out_path)           # the spreadsheet is always up to date
        print(f"{qid} {code} saved ({len(results)}/80)", flush=True)

    for qid, text, _ in INDEPENDENT:
        for code, title, _ in ROLES:
            if f"{qid}|{code}" not in results:
                record(qid, code, ask(client, tokens[code], text, []))      # fresh chat every time

    for code, title, _ in ROLES:                                            # one conversation per role
        history = []
        for qid, text, _ in DRILL_DOWN:
            key = f"{qid}|{code}"
            if key not in results:
                record(qid, code, ask(client, tokens[code], text, history))
            history += [{"role": "user", "content": text}, {"role": "assistant", "content": results[key]}]
    print("saved", out_path)


if __name__ == "__main__":
    main_run(sys.argv[1] if len(sys.argv) > 1 else "../docs/Scenario Wise Claude Response - Rerun.xlsx")
