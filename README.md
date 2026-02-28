# 🎓 cf_ai_academic_research_agent

> A **Stateful Academic Research Planning Agent** built on Cloudflare's AI platform stack.

🌐 **Live demo:** https://cf-ai-research-agent-frontend.pages.dev/

Instead of answering one-off questions, this agent collaborates with you across sessions to **scope, plan, and conduct full literature reviews** — powered by Workers AI (Llama 3.3), Durable Objects for persistent state, and arXiv for real academic sources.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                      │
│              React Chat UI (Frontend)                    │
│   • Sidebar with Generate Plan button                    │
│   • Phase indicator  • Quick actions                     │
└───────────────────────┬─────────────────────────────────┘
                        │ POST /api/chat
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Worker                       │
│              (Request routing + CORS)                    │
│   POST /api/chat   GET /api/workspace/:id                │
│   GET /api/workspaces                                    │
└───────────────────────┬─────────────────────────────────┘
                        │ routeAgentRequest (Agents SDK)
                        ▼
┌─────────────────────────────────────────────────────────┐
│              ResearchAgent (Durable Object)              │
│                  via Cloudflare Agents SDK               │
│                                                          │
│  Phase 1: Clarification  → scoping Q&A loop              │
│  Phase 2: Planning       → generate research plan        │
│  Phase 3: Gathering      → searchArxiv() for papers      │
│  Phase 4: Summarizing    → Workers AI per paper          │
│  Phase 5: Ongoing        → Q&A with full context         │
│                                                          │
│  State persisted via setState() to SQLite:               │
│  topic, plan, sources, paperInsights,                    │
│  chatHistory, clarifications, workspaceId                │
└────────────┬──────────────────────┬─────────────────────┘
             │                      │
             ▼                      ▼
┌────────────────────┐  ┌───────────────────────────────┐
│   Workers AI       │  │       arXiv Public API        │
│ Llama 3.3 70B FP8  │  │  AND-joined term search       │
│ • Clarifying Qs    │  │  title, abstract, authors,    │
│ • Research plans   │  │  link, published date         │
│ • Paper analysis   │  └───────────────────────────────┘
│ • Q&A              │
└────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            Daily Cron (Scheduled Worker)                 │
│  0 2 * * * → refreshAllResearch()                        │
│  • Lists all workspaces from KV                          │
│  • Searches arXiv for new papers per topic               │
│  • Updates workspace state via Durable Object            │
└─────────────────────────────────────────────────────────┘
```

---

## ☁️ Cloudflare Services Used

| Service | Usage |
|---|---|
| **Cloudflare Workers** | API routing, request handling, CORS |
| **Agents SDK** | Manages Durable Object routing and SQLite state persistence |
| **Durable Objects** | One per research workspace — persists all state |
| **Workers AI (Llama 3.3)** | Clarifying questions, research plans, summarization, Q&A |
| **KV Namespace** | Workspace index for the daily refresh job |
| **Cron Triggers** | Daily job to refresh research with new arXiv papers |
| **Cloudflare Pages** | Hosts the React chat frontend |

---

## 🚀 Setup & Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v3+
- A [Cloudflare account](https://dash.cloudflare.com/) with Workers AI enabled

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/cf_ai_academic_research_agent
cd cf_ai_academic_research_agent
```

### 2. Install dependencies

```bash
npm run install:all
```

### 3. Create a KV Namespace

```bash
npx wrangler kv namespace create RESEARCH_KV
npx wrangler kv namespace create RESEARCH_KV --preview
```

> **Note:** Wrangler v4 dropped the colon syntax. Use `wrangler kv namespace create` (with spaces) instead of `wrangler kv:namespace create`.

Copy the IDs into `workers/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RESEARCH_KV"
id = "YOUR_ID_HERE"
preview_id = "YOUR_PREVIEW_ID_HERE"
```

### 4. Deploy the Worker

```bash
npm run deploy:worker
```

Wrangler will automatically create the Durable Object migration and register the cron trigger.

Note the deployed URL: `https://cf-ai-academic-research-agent.YOUR-SUBDOMAIN.workers.dev`

### 5. Configure the Frontend

```bash
cp frontend/.env.example frontend/.env.local
# Edit .env.local and set VITE_API_URL to your Worker URL
```

### 6. Deploy the Frontend to Cloudflare Pages

```bash
cd frontend
npm run build
```

Then in the Cloudflare Dashboard → Pages → Create a project → Upload `frontend/dist`.

Or use Wrangler Pages:

```bash
npx wrangler pages deploy frontend/dist --project-name cf-ai-research-agent-frontend
```

### 7. Local Development

Run the Worker locally:
```bash
cd workers && npx wrangler dev
```

Run the frontend locally (in a separate terminal):
```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`

---

## 💬 Usage Guide

1. **Open the app** and type your research topic (e.g., *"echocardiogram video analysis using deep learning"*)
2. **Chat with the agent** to clarify your focus — it will ask targeted follow-up questions
3. **Click "Generate Research Plan"** in the sidebar when you're ready — this sends all conversation context to the LLM to produce a specific, tailored plan
4. **Wait ~30-60 seconds** while the agent searches arXiv and analyzes up to 8 papers synchronously
5. **Ask follow-up questions** once in the Active phase — the agent answers using the full paper context
6. **New session each time** — each page load starts a fresh workspace

### Useful commands (once in "Active" phase):
- `summarize progress` — see full workspace summary with paper counts
- `show papers` — list all found papers with summaries
- `add more sources` — trigger another arXiv search with the existing keywords
- Any research question — answered using the stored paper context

---

## 📁 Project Structure

```
cf_ai_academic_research_agent/
├── workers/
│   ├── src/
│   │   ├── index.ts              # Worker entry point + routing
│   │   ├── agent.ts              # ResearchAgent Durable Object (Agents SDK)
│   │   ├── env.ts                # Environment bindings type
│   │   ├── tools/
│   │   │   └── arxiv.ts          # arXiv search + Atom XML parser
│   │   └── workflows/
│   │       └── refreshResearch.ts # Daily cron workflow
│   ├── wrangler.toml             # Cloudflare Worker config
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main chat UI + sidebar with plan button
│   │   ├── main.tsx              # React entry
│   │   └── components/
│   │       ├── ChatMessage.tsx   # Message bubble with markdown rendering
│   │       └── PhaseIndicator.tsx # Research phase progress tracker
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── README.md
└── PROMPTS.md
```

---

## 🔑 Key Design Decisions

**Agents SDK over raw Durable Objects.** The Cloudflare Agents SDK wraps Durable Objects with automatic SQLite-backed `setState()` persistence, hibernation-safe request handling, and clean `onRequest()` lifecycle hooks — eliminating boilerplate and making state mutations atomic.

**Draft-based state batching.** All state mutations within a request go through a local `draft` object via `patch()`, with a single `setState()` flush at the end. This prevents multiple concurrent `setState()` calls from clobbering each other — a common bug with naive Durable Object usage where each call spreads stale `this.state` and overwrites earlier mutations in the same request.

**Deferred history commits.** Each request stores the user/assistant exchange as `pendingUserMsg`/`pendingAssistantMsg`, committed to `chatHistory` at the *start* of the next request. This ensures the LLM always sees a complete history — including the most recent exchange — when building context for clarification questions.

**Explicit plan trigger (button, not keywords).** Plan generation is triggered by an `__GENERATE_PLAN__` sentinel message from a dedicated sidebar button — not by parsing user text for phrases like "give me the plan". This eliminates false triggers and topic corruption from casual conversation, and gives the user full control over when to transition phases.

**Full conversation context in plan generation.** The `generatePlan()` function feeds the entire Q&A transcript from `chatHistory` to the LLM, not just a sparse `clarifications` object populated by keyword matching. This produces specific, relevant plans rather than generic placeholder outlines.

**Synchronous paper gathering.** `gatherAndAnalyzeSources()` runs synchronously within the plan request (awaited, not fire-and-forget). Fire-and-forget caused Cloudflare to hibernate the Durable Object mid-search, silently returning 0 papers. The plan response takes 30-60s but papers are guaranteed to be present when it returns.

**AND-joined arXiv queries.** Multi-word keywords are split into individual terms joined with `+AND+` (e.g. `all:echocardiogram+AND+all:deep+AND+all:learning`). The `all:phrase` format does exact phrase matching and returns 0 results for most multi-word queries.

**Workspace-per-session.** Each page load generates a fresh workspace UUID, avoiding stale Durable Object state from previous sessions bleeding into new conversations.

**Why Llama 3.3 70B FP8?** The faster FP8 variant gives near-70B quality at production latency suitable for interactive chat. Used for all LLM calls within the agent.

**Why arXiv?** No API key required, excellent coverage of CS/ML/medicine/physics research, and returns rich structured metadata including full abstracts suitable for summarization.

---

## License

MIT