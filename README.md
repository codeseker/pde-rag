# PDE RAG

A deliberately small RAG application for partial differential equations—including first-order equations written with $p=z_x$ and $q=z_y$, Lagrange/Charpit general solutions, and heat/wave/Laplace/Poisson problems—plus plasma and semiconductor modelling questions. It retrieves source chunks from PostgreSQL/pgvector and asks an LLM for a grounded answer—structured JSON for PDE solves and concise Markdown for conceptual plasma/semiconductor questions. When a PDE answer includes a machine-readable SymPy form, it checks the PDE residual and boundary/initial conditions with a Python/SymPy service.

## What is included

- **`POST /feed`** — upload a PDF (`file`) or send JSON `{ "title": "...", "text": "..." }`.
- **`POST /ask`** — ask a question. Streams SSE by default, or returns JSON with `?stream=false`.
- **4-node LangGraph flow** — `classify → retrieve → solve → verify`.
- **Equation-safe chunking** — protects display equations and question/solution blocks.
- **Pinned context** — text fed through `/feed` is prepended to every retrieval result.
- **PostgreSQL + pgvector** — `documents` and `chunks`, cosine HNSW index, SHA-256 duplicate detection.
- **SymPy verifier** — one FastAPI endpoint, `POST /verify`.
- **React UI** — Ask and Feed tabs, SSE streaming, PDF drag/drop, live KaTeX preview, collapsible sources, verification badges.
- **Eval script** — 15 starter questions with SymPy equivalence checks and an LLM judge for conceptual answers.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, KaTeX, react-markdown |
| Backend | NestJS 12, strict TypeScript, LangChain JS, LangGraph JS |
| Models | Groq `ChatGroq` for chat, Gemini `gemini-embedding-001` for 1024-dim embeddings |
| Data | PostgreSQL 16, pgvector, Drizzle ORM |
| Verifier | Python, FastAPI, SymPy |
| Runtime | Docker Compose, 4 services |

## Run

Requirements: Docker Compose, a Groq API key for chat, and a Google AI Studio API key for Gemini embeddings. OpenAI and Ollama remain available as alternate strategies.

```bash
cp .env.example .env
# Edit .env and set GROQ_API_KEY and GOOGLE_API_KEY.
docker compose up --build
```

Open **http://localhost:5173**.

Other ports:

- Backend API: `http://localhost:3000`
- SymPy verifier: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

To run everything in **one container** (the same image used for the Render deployment), see [Deploying to Render](#deploying-to-render-free-tier) — it also works locally with `docker build` + `docker run`.

Database migrations run automatically when the backend starts. To reset the database:

```bash
docker compose down -v
docker compose up --build
```

The embedding dimension is fixed at **1024**. The default setup uses Groq `openai/gpt-oss-120b` for chat and Gemini `gemini-embedding-001` with `outputDimensionality: 1024` for embeddings. Groq does not provide an embeddings API, so Gemini is used for the retrieval vectors.

Groq's free tier is limited by tokens per minute, so the defaults keep each request small: `TOP_K=3`, `CHUNK_SIZE=600`, and `MAX_CONTEXT_CHARS=6000`. `openai/gpt-oss-120b` has a much larger free-tier output-token allowance than the Qwen models, so it can return complete answers without truncation. Provider calls are not retried; if a rate limit is reached, the API returns a short "try again in about 30 seconds" message instead of a retry loop. For even more throughput, move the Groq organization to the Developer tier.

### Alternative providers

OpenAI and Ollama remain registered strategies. To use OpenAI for everything:

```dotenv
LLM_STRATEGY=openai
EMBEDDING_STRATEGY=openai
OPENAI_API_KEY=...
```

To use Ollama embeddings alongside Groq chat:

```dotenv
LLM_STRATEGY=groq
EMBEDDING_STRATEGY=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_EMBEDDING_MODEL=bge-m3
```

Ollama is not a Compose service. If you change the embedding strategy after feeding data, reset the database (`docker compose down -v`). The backend refuses to mix embeddings from different strategies.

## Local development

You can run the backend and frontend on the host while PostgreSQL and the verifier run in Docker:

```bash
cp .env.example .env
docker compose up -d postgres verifier

cd backend
pnpm install
pnpm start:dev
```

In another terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

The Vite dev server runs at `http://localhost:5173` and calls `VITE_API_URL` (default `http://localhost:3000`). For a non-default local API URL, create `frontend/.env` with `VITE_API_URL=http://...`; Vite does not read the repository-root `.env`. The backend reads `.env` from `backend/` or the repository root, runs migrations at startup, and reads `VERIFIER_URL` (default `http://localhost:8000`).

To run the verifier without Docker:

```bash
cd verifier
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

When running the backend on the host, set `OLLAMA_BASE_URL=http://localhost:11434` only if you use the Ollama strategy. Inside Docker it defaults to `http://host.docker.internal:11434`.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `MIGRATION_DATABASE_URL` | Optional direct connection used for schema migrations | `DATABASE_URL` |
| `LLM_STRATEGY` | Active LLM strategy name | `groq` |
| `EMBEDDING_STRATEGY` | Active embedding strategy name | `gemini` |
| `GROQ_API_KEY` | Groq API key for the default LLM | empty |
| `GROQ_LLM_MODEL` | Groq chat model | `openai/gpt-oss-120b` |
| `GROQ_MAX_OUTPUT_TOKENS` | Output token cap per Groq request | `4096` |
| `GOOGLE_API_KEY` | Google AI Studio key for Gemini embeddings | empty |
| `GEMINI_API_KEY` | Optional fallback name for the Google key | empty |
| `GEMINI_EMBEDDING_MODEL` | Gemini embedding model (1024 dimensions) | `gemini-embedding-001` |
| `OPENAI_API_KEY` | OpenAI key for the OpenAI fallback strategies | empty |
| `OPENAI_LLM_MODEL` | OpenAI chat model | `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | OpenAI embedding model (1024 dimensions) | `text-embedding-3-small` |
| `OLLAMA_BASE_URL` | Ollama API base URL | `http://host.docker.internal:11434` |
| `OLLAMA_LLM_MODEL` | Ollama chat model | `llama3.1` |
| `OLLAMA_EMBEDDING_MODEL` | Ollama embedding model (1024 dimensions) | `bge-m3` |
| `CHUNK_SIZE` | Character chunk size | `600` |
| `CHUNK_OVERLAP` | Character chunk overlap | `100` |
| `TOP_K` | Retrieved non-pinned chunks per query | `3` |
| `MAX_CONTEXT_CHARS` | Hard cap on retrieved context sent to the LLM | `6000` |
| `VERIFIER_URL` | SymPy verifier base URL | `http://localhost:8000` |
| `VITE_API_URL` | Browser-visible API URL (build-time in Docker). Production builds use `https://pde-rag.onrender.com`; local dev defaults to `http://localhost:3000`. | `https://pde-rag.onrender.com` (Docker) |
| `EVAL_API_URL` | API target for the eval script | `http://localhost:3000` |
| `DB_MIGRATION_ATTEMPTS` | Migration attempts per startup/recovery cycle | `5` |
| `DB_MIGRATION_RETRY_MS` | Delay between migration attempts | `2000` |
| `DB_BACKGROUND_RETRY_MS` | Delay before retrying a failed database initialization | `15000` |
| `DB_HEALTH_TIMEOUT_MS` | Timeout for `/health` database and verifier probes | `3000` |

## API examples

### Health and diagnostics

`GET /health` checks the API, PostgreSQL and the SymPy verifier. It returns
`200` only when the database is reachable; otherwise it returns `503` with a
sanitized reason. `GET /live` is a liveness-only check that does not touch the
database.

```bash
curl -i https://pde-rag.onrender.com/health
curl -i https://pde-rag.onrender.com/live
```

### Feed text

```bash
curl -X POST http://localhost:3000/feed \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Heat equation notes",
    "text": "For u_t = alpha^2 u_xx on 0 < x < L with zero endpoint temperatures, separation of variables gives u = sum b_n sin(n*pi*x/L) exp(-alpha^2 n^2 pi^2 t/L^2). The initial condition fixes the coefficients b_n."
  }'
```

Response:

```json
{ "documentId": "…", "chunks": 1 }
```

### Feed PDF

```bash
curl -X POST http://localhost:3000/feed \
  -F "file=@notes.pdf"
```

### Ask with JSON

```bash
curl -X POST "http://localhost:3000/ask?stream=false" \
  -H "Content-Type: application/json" \
  -d '{ "question": "Solve the heat equation with zero endpoint temperatures and u(x,0)=sin(pi*x/L)." }'
```

Response:

```json
{
  "answer": "…markdown with LaTeX…",
  "sources": [
    {
      "label": "S1",
      "documentId": "…",
      "title": "Heat equation notes",
      "page": 1,
      "contentType": "theory",
      "pdeCategory": "heat",
      "excerpt": "…"
    }
  ],
  "verification": "verified"
}
```

### Ask with SSE

```bash
curl -N -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{ "question": "How are drift-diffusion equations used in plasma process simulation?" }'
```

Events are JSON payloads in `data:` lines:

```text
data: {"type":"token","text":"..."}
data: {"type":"sources","sources":[...]}
data: {"type":"done","verification":"not_applicable"}
```

An error during streaming is delivered as:

```text
data: {"type":"error","message":"..."}
```

### Verification statuses

- `verified` — SymPy reduced the PDE residual to zero and all supplied conditions passed.
- `failed` — the residual or a condition did not check out; the answer is shown with a warning and is not presented as verified.
- `inconclusive` — no machine-readable SymPy form was available, or the verifier could not decide.
- `not_applicable` — conceptual plasma/semiconductor answers and out-of-scope refusals.

Answers are grounded in fed material. Feed at least one relevant note or PDF before asking, otherwise the assistant will report insufficient context.

## Evaluation

The eval script is `backend/scripts/eval.ts`. It contains 15 starter questions:

- 5 textbook PDEs with known symbolic answers,
- 5 JEE-style PDE/calculus questions with known answers,
- 5 conceptual plasma/semiconductor questions with reference answers.

Math answers are extracted to SymPy and compared by mathematical equivalence through the verifier. Conceptual answers are graded by the active LLM against the reference answer.

Run it while the API and verifier are running, from the repository root:

```bash
cd backend
pnpm install
pnpm eval
```

It uses:

- `EVAL_API_URL` (default `http://localhost:3000`)
- `VERIFIER_URL` from `.env` (default `http://localhost:8000`)

The quality of the evaluation depends on the knowledge you fed first. Review and extend the questions, reference answers, and threshold before treating the score as a production gate. If accuracy is below 80%, the script prints the intended tuning order:

1. chunk size / overlap,
2. prompt rules,
3. few-shot examples,
4. retrieval top-k.

## Adding a new model strategy

Models use the strategy pattern only—there is no factory or provider switch.

1. Create a class implementing `ILlmStrategy` or `IEmbeddingStrategy` in `backend/src/models/strategies/`.
2. Give it a unique `name`.
3. Register it in the relevant array in `backend/src/models/models.module.ts`:
   - `LLM_STRATEGY_CLASSES`
   - `EMBEDDING_STRATEGY_CLASSES`
4. Set `LLM_STRATEGY` or `EMBEDDING_STRATEGY` in `.env`.

Embedding strategies must produce **1024-dimensional** vectors because the database schema and HNSW index are fixed to that dimension. Supporting another dimension requires a schema migration and re-feeding the corpus.

## Project layout

```text
backend/
  src/
    ask/          # AskController, AskGraph, prompts
    feed/         # FeedController, PDF loader, equation-safe chunker
    models/       # LLM/embedding strategies, contexts, verifier client
    database/     # schema, migration runner, ChunkRepository
  drizzle/        # SQL migrations
  scripts/eval.ts
verifier/         # FastAPI + SymPy
frontend/         # React/Vite/Tailwind/KaTeX
deploy/           # nginx + supervisord + entrypoint for the single image
Dockerfile        # single image: nginx + API + verifier
render.yaml       # Render blueprint (one web service + one database)
docker-compose.yml
.env.example
```

## Scope and limitations

This is an MVP, not a production service:

- No authentication, sessions, queues, or rate limiting.
- Exactly two public backend endpoints.
- Only two tables: `documents` and `chunks`.
- PDF extraction is text-based; scanned/image-only PDFs are not OCR'd.
- Verification applies only to `pde_solve` answers with a SymPy transcription.
- The verifier is intentionally narrow: it checks the supplied residual and conditions, not every possible interpretation of a problem.
- The 15-question eval set is a starter and must be reviewed and extended for real use.

## Tests and local validation

```bash
cd backend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test

cd ../frontend
pnpm install --frozen-lockfile
pnpm typecheck
VITE_API_URL=https://pde-rag.onrender.com pnpm build
```

Build and smoke-test the production image locally:

```bash
docker build --build-arg VITE_API_URL=http://localhost:8080 -t pde-rag-single .
docker compose up -d postgres
docker run --rm --network pde-rag_default -p 8080:10000 \
  -e DATABASE_URL="postgresql://pde:pde@postgres:5432/pde" \
  -e GROQ_API_KEY="$GROQ_API_KEY" \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e PORT=10000 \
  pde-rag-single:latest

./deploy/smoke-test.sh http://127.0.0.1:8080
SMOKE_PROVIDER_TESTS=1 ./deploy/smoke-test.sh http://127.0.0.1:8080
```

`/health` returning `503` with `database: unavailable` means PostgreSQL is not
reachable; the container itself is running. The logs include a redacted reason
and migrations/retry continues in the background.

## Deploying to Render (free tier)

This deployment uses **one Docker image** for the whole application and **one public URL**. The React app, the NestJS API, and the FastAPI/SymPy verifier all run inside that single container, and the API is reverse-proxied on the same origin as the page, so the browser never makes a cross-origin request and **CORS never comes into play**.

### How the single image is wired

| Listener | Process | Reachable from the internet? |
| --- | --- | --- |
| `$PORT` (Render default `10000`) | nginx: static React build + reverse proxy | yes |
| `3000` | NestJS API (`/ask`, `/feed`) | no, loopback only |
| `8000` | FastAPI + SymPy verifier | no, loopback only |

Files involved:

- `Dockerfile` (repo root) — multi-stage build: React bundle → compiled NestJS app → runtime with nginx, Node, Python and supervisord.
- `deploy/nginx.conf` — nginx main config.
- `deploy/site.conf.template` — the site config; `__PORT__` is replaced with `$PORT` at container start.
- `deploy/supervisord.conf` — starts the verifier, the API and nginx, and keeps them alive.
- `deploy/entrypoint.sh` — renders the nginx config and starts supervisord.

The only external dependency is a PostgreSQL database with the `pgvector` extension.

### 1. Push the repository to GitHub

Render builds from a Git repository, so push the project (including the new `Dockerfile`, `deploy/` and `render.yaml`).

### 2. Create the database (pgvector required)

The schema stores `vector(1024)` embeddings, so the database must have `pgvector` available. The migration runs `CREATE EXTENSION IF NOT EXISTS vector;` automatically, but enabling it up front is faster and clearer.

**Option A — Render PostgreSQL (zero config, expires in 30 days)**

1. Render dashboard → **New → Postgres**.
2. Name it `pde-rag-db`, database `pde`, user `pde`, plan **Free**, region **Oregon** (free web services only run in Oregon).
3. Copy the **Internal Database URL** — it looks like `postgresql://pde:<password>@dpg-xxxx:5432/pde` and is only reachable from services in the same workspace and region.

> Render's free Postgres is a trial: it expires 30 days after creation, has a 14-day grace period, and is then deleted along with its data. Only one free Postgres is allowed per workspace. Use Option B for a database that does not expire.

**Option B — Neon (free, no expiry, recommended)**

1. Create a free Neon project and a branch.
2. In the Neon SQL editor run `CREATE EXTENSION IF NOT EXISTS vector;`.
3. Copy both connection strings from **Connection details**:
   - the **pooled** URL → `DATABASE_URL` (keep the `?sslmode=require` that Neon adds),
   - the **direct** URL → `MIGRATION_DATABASE_URL` (optional).

`MIGRATION_DATABASE_URL` is optional. When it is set, the Drizzle migration runner opens a separate connection for schema changes, which avoids session-level advisory locks fighting with a transaction-pooling proxy.

### 3. Create the Web Service

1. Render dashboard → **New → Web Service** → connect the GitHub repository.
2. **Runtime:** Docker.
3. **Dockerfile path:** `./Dockerfile`
4. **Docker context:** `.` (repository root — the build needs `frontend/`, `backend/`, `verifier/` and `deploy/`).
5. **Instance type:** Free.
6. **Region:** Oregon (free instances are only available there).
7. **Health check path:** `/health` (nginx proxies it to NestJS, which verifies
   PostgreSQL; a broken database is reported as unhealthy instead of leaving a
   container that serves the React shell but 502s every API call).
8. Click **Create Web Service**. The first build takes roughly 4–6 minutes and produces a ~1.1 GB image.

### 4. Set the environment variables

Add these under **Environment** in the Render dashboard (secrets are encrypted at rest):

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string, e.g. `postgresql://pde:...@host:5432/pde` |
| `MIGRATION_DATABASE_URL` | no | Direct (non-pooled) connection string used for migrations |
| `GROQ_API_KEY` | yes | Groq key for the chat model |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | yes | Google AI Studio key for embeddings |
| `LLM_STRATEGY` | no | `groq` (default) |
| `EMBEDDING_STRATEGY` | no | `gemini` (default) |
| `GROQ_LLM_MODEL` | no | `openai/gpt-oss-120b` (default) |
| `GROQ_MAX_OUTPUT_TOKENS` | no | `4096` (default) |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` / `TOP_K` / `MAX_CONTEXT_CHARS` | no | `600` / `100` / `3` / `6000` |
| `PORT` | no | Do not set it. Render injects it and nginx binds to it. |

Then **Save & Deploy**.

### 5. Verify the deployment

```bash
# The app shell
curl -I https://<your-service>.onrender.com/

# Ask a question (JSON instead of SSE)
curl -X POST "https://<your-service>.onrender.com/ask?stream=false" \
  -H "Content-Type: application/json" \
  -d '{"question":"Solve p + 3q = 5z + tan(y - 3x)"}'

# Feed a document
curl -X POST https://<your-service>.onrender.com/feed \
  -H "Content-Type: application/json" \
  -d '{"title":"Notes","text":"u_t = alpha^2 u_xx is the heat equation."}'
```

Open the site, feed your knowledge on the **Feed** tab, then ask on the **Ask** tab.

### 6. Why production has no CORS problem

- The production frontend is built with `VITE_API_URL=https://pde-rag.onrender.com`
  (the default in the root `Dockerfile`), so the browser calls
  `https://pde-rag.onrender.com/ask` and `https://pde-rag.onrender.com/feed`.
- Those URLs are the same origin that served the page. nginx serves the page and
  proxies the two paths to `127.0.0.1:3000` inside the container, so the request
  never leaves the origin.
- The API also keeps `app.enableCors()` enabled, so local development with
  `http://localhost:5173` → `http://localhost:3000` still works.

No `Access-Control-Allow-Origin` headers, no preflight requests, nothing to
configure in the browser for production.

### 7. One-click deploy with `render.yaml`

`render.yaml` in the repository root is a Render blueprint that creates the web service **and** a free Postgres database, wiring `DATABASE_URL` and `MIGRATION_DATABASE_URL` automatically. In Render choose **New → Blueprint** and point it at the repository. You will still be prompted for `GROQ_API_KEY` and `GEMINI_API_KEY`.

### 8. Run the same image locally

```bash
# The production default is https://pde-rag.onrender.com. For a local smoke
# test, point the bundle at the port you publish below.
docker build --build-arg VITE_API_URL=http://localhost:8080 -t pde-rag-single .

# Reuse the Compose database so the fed documents are already there.
docker compose up -d postgres

docker run --rm --network pde-rag_default -p 8080:10000 \
  -e DATABASE_URL="postgresql://pde:pde@postgres:5432/pde" \
  -e GROQ_API_KEY="$GROQ_API_KEY" \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e PORT=10000 \
  pde-rag-single:latest
```

Open **http://localhost:8080** — the same single origin, the same proxy, no CORS.

### 9. What the free tier actually gives you

- 512 MB RAM per instance, one shared CPU. Node + Python + nginx fit, but keep `TOP_K` and `MAX_CONTEXT_CHARS` small.
- The service spins down after ~15 minutes of inactivity and the first request after that can take ~30–60 seconds while it wakes up.
- 750 free instance hours per workspace per month, and 500 build minutes per month.
- The container filesystem is ephemeral: nothing is stored on disk between restarts. All state lives in PostgreSQL, so documents and chunks survive restarts and redeploys.
- Render's free PostgreSQL expires after 30 days. Use Neon (Option B) if the data must survive the month.
- Groq and Gemini keep their own free-tier quotas; a burst of questions can still return the "model provider is rate-limited" message.

### 10. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `502 Bad Gateway` on `/ask` or `/feed`, but `/` works | nginx is up; the NestJS upstream on `127.0.0.1:3000` is not listening. Most often the database is unreachable or the backend is still starting. | Check Render logs and `GET /health`. A DB failure now returns `503` with a sanitized reason instead of a permanent nginx `502`; fix `DATABASE_URL`/the expired database. |
| `GET /health` is `503` with `database: unavailable` | PostgreSQL is down, expired, or `DATABASE_URL` is wrong | Verify `DATABASE_URL` and that pgvector is enabled. Migrations retry in the background; no redeploy is required after the database recovers. |
| `service did not respond` during deploy | The health check path is wrong, or the database never becomes reachable | Keep the health check path as `/health`. Fix the database; Render will not mark a container healthy while it returns 503. |
| `CREATE SCHEMA IF NOT EXISTS "drizzle"` keeps failing | Wrong `DATABASE_URL`, or the extension is missing | Check the URL, and run `CREATE EXTENSION IF NOT EXISTS vector;` in the database |
| `CREATE SCHEMA ...` followed by `AggregateError [ETIMEDOUT]` | The API cannot open a TCP connection to the database (expired/suspended database, wrong host/port, or a Render internal URL used from another region) | Use the database's **external** URL if the web service and database are in different regions. For Neon set the pooled URL as `DATABASE_URL` and the direct URL as `MIGRATION_DATABASE_URL`. Re-check that the database is still available in the dashboard. |
| Browser shows CORS errors in local development | The frontend was built for a different API origin | Production uses `https://pde-rag.onrender.com`; when running Vite locally, set `frontend/.env` to `VITE_API_URL=http://localhost:3000`. |
| `413 Request Entity Too Large` on a PDF | Upload limit | `client_max_body_size` is 25 MB in `deploy/site.conf.template`; raise it if needed |
| Answers are cut off mid-sentence | Provider output-token limit | Raise `GROQ_MAX_OUTPUT_TOKENS` (keep it under the provider's per-minute cap) or shorten the question |
| Database disappeared after a month | Free Render Postgres expired | Move to Neon and update `DATABASE_URL` |
