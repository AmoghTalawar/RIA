# RIA Chatbot Backend (Python)

FastAPI service that owns the Groq tool-calling loop and SQL execution for the
RIA dashboard chatbot. Replaces the browser-side logic in
`src/tools/sqlTool.js` and `src/tools/intentRouter.js`.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # fill in GROQ_API_KEY + SUPABASE_*
```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Health check: `curl http://localhost:8000/health`

## API

`POST /chat`

```json
{ "message": "Top 5 faculty by citations", "chart_title": null }
```

Response:

```json
{ "reply": "Top 5 by Cit:\n1. ...", "source": "intent_router" }
```

Optional header `X-Groq-Key: gsk_...` overrides the server env key per request.

## Frontend wiring

Set `VITE_CHAT_API_URL` in `ria-dashboard/.env` (defaults to
`http://localhost:8000`). `AIChatbot.jsx` POSTs to `${VITE_CHAT_API_URL}/chat`.
