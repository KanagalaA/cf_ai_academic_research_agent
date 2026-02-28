# 🎓 cf_ai_academic_research_agent

> A **Stateful Academic Research Planning Agent** built on Cloudflare's AI platform stack.

Instead of answering one-off questions, this agent collaborates with you across sessions to **scope, plan, and conduct full literature reviews** — powered by Workers AI (Llama 3.3), Durable Objects for persistent state, and arXiv for real academic sources.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                      │
│              React Chat UI (Frontend)                    │
│   • Message history  • Phase indicator  • Quick actions │
└───────────────────────┬─────────────────────────────────┘
                        │ POST /api/chat
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Worker                       │
│              (Request routing + CORS)                    │
│          GET /api/workspaces   GET /api/workspace/:id   │
└───────────────────────┬─────────────────────────────────┘
                        │ Durable Object stub
                        ▼
┌─────────────────────────────────────────────────────────┐
│              ResearchAgent (Durable Object)              │
│                                                          │
│  Phase 1: Clarification  → ask scoping questions         │
│  Phase 2: Planning       → generate research plan        │
│  Phase 3: Source Gathering → searchArxiv() tool          │
│  Phase 4: Summarization  → Workers AI per paper          │
│  Phase 5: Ongoing        → Q&A with full context         │
│                                                          │
│  Persistent state: topic, plan, sources, summaries,      │
│  chat history, clarifications                            │
└────────────┬──────────────────────┬─────────────────────┘
             │                      │
             ▼                      ▼
┌────────────────────┐  ┌───────────────────────────────┐
│   Workers AI       │  │       arXiv Public API        │
│ Llama 3.3 70B FP8  │  │  searchArxiv(query) → papers  │
│ • Clarifying Qs    │  │  title, abstract, authors,    │
│ • Research plans   │  │  link, published date         │
│ • Summarization    │  └───────────────────────────────┘
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
npx wrangler kv:namespace create RESEARCH_KV
npx wrangler kv:namespace create RESEARCH_KV --preview
```

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

1. **Open the app** and type your research topic (e.g., *"transformer architecture in NLP"*)
2. **Answer 4 clarifying questions** about your level, purpose, focus, and timeline
3. **Receive a research plan** with subtopics, keywords, and outline
4. **Agent searches arXiv** and summarizes top papers automatically
5. **Ask follow-up questions** using your research context
6. **Return any time** — the workspace persists across sessions

### Useful commands (once in "ongoing" phase):
- `summarize progress` — see full workspace summary
- `show sources` — list all papers with summaries
- `add more sources` — trigger another arXiv search
- Any research question — answered using stored context

---

## 📁 Project Structure

```
cf_ai_academic_research_agent/
├── workers/
│   ├── src/
│   │   ├── index.ts              # Worker entry point + routing
│   │   ├── agent.ts              # ResearchAgent Durable Object
│   │   ├── tools/
│   │   │   └── arxiv.ts          # arXiv search tool
│   │   └── workflows/
│   │       └── refreshResearch.ts # Daily cron workflow
│   ├── wrangler.toml             # Cloudflare Worker config
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main chat UI
│   │   ├── main.tsx              # React entry
│   │   └── components/
│   │       ├── ChatMessage.tsx   # Message bubble
│   │       └── PhaseIndicator.tsx # Research phase tracker
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── README.md
└── PROMPTS.md
```

---

## 📸 Screenshots

The UI features a dark-themed chat interface with:
- A collapsible sidebar showing workspace info
- A phase progress indicator (Scoping → Planning → Searching → Reading → Active)
- Chat bubbles for user/assistant messages
- Quick action chips when research is active
- Paper count displayed in the header

---

## 🔑 Key Design Decisions

**Why Durable Objects?** Each research workspace needs fully isolated, persistent state. Durable Objects give us a single-threaded, strongly-consistent storage model per workspace — perfect for stateful agents.

**Why Llama 3.3 70B FP8?** The faster FP8 variant gives us near-70B quality at production latency suitable for interactive chat. Used for all LLM calls within the agent.

**Why arXiv?** No API key required, excellent coverage of CS/ML/physics/math research, and returns rich structured metadata including full abstracts.

**Streaming considerations:** The architecture is designed to be extended with streaming responses using Workers' `TransformStream` — the `/api/chat` endpoint can be upgraded to stream tokens as they arrive from Workers AI.

---

## License

MIT
