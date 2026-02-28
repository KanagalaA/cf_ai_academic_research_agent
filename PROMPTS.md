# PROMPTS.md

> AI prompts used to design and generate the `cf_ai_academic_research_agent` project.
> Required by Cloudflare internship assignment guidelines.

---

## 1. Architecture Design Prompt

**Used to:** Design the overall system architecture before writing any code.

```
You are a Cloudflare platform expert helping design a production-quality AI agent.

I need to build a "Stateful Academic Research Planning Agent" using:
- Cloudflare Workers (routing)
- Durable Objects (persistent state per workspace)
- Workers AI with Llama 3.3 (LLM calls)
- arXiv public API (external tool)
- KV Namespace (workspace index)
- Cron triggers (daily refresh)
- React frontend (chat UI)

The agent should:
1. Ask clarifying questions when given a research topic
2. Generate a structured research plan
3. Search arXiv for relevant papers
4. Summarize papers using Workers AI
5. Allow ongoing Q&A using stored context
6. Persist all state so users can return later

Design the architecture: what does each Cloudflare service do,
how do they communicate, what data flows where?
Give me a text-based architecture diagram.
```

---

## 2. Agent Behavior Spec Prompt

**Used to:** Define the agent's multi-phase behavior before implementing it.

```
Design the behavior for a stateful research agent as a Durable Object class.

The agent has 5 phases:
1. Clarification — ask 4 targeted questions (level, purpose, focus, timeline)
2. Planning — generate JSON research plan with subtopics/keywords/outline
3. Gathering — call arXiv search tool with plan keywords
4. Summarizing — summarize each paper abstract with LLM
5. Ongoing — Q&A with stored research context

For each phase, define:
- What triggers the transition to this phase
- What state is read and written
- What LLM prompt is used
- What the user sees

Also define special command handlers for "ongoing" phase:
- "summarize progress"
- "show sources"  
- "add more sources"
```

---

## 3. Durable Object Implementation Prompt

**Used to:** Generate the ResearchAgent Durable Object class.

```
Write a TypeScript Cloudflare Durable Object class called ResearchAgent.

Requirements:
- State interface: WorkspaceState with fields for topic, phase, clarifications (Record<string,string>),
  plan (subtopics/keywords/outline), sources (ArxivPaper[]), summaries (Record<string,string>),
  chatHistory (ChatMessage[]), clarificationStep (number)

- loadState() / saveState() methods using this.state.storage
- Also save to KV namespace for workspace listing

- callLLM() method that calls env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast')
- generateResearchPlan() that returns JSON-structured plan from LLM
- summarizePaper() that writes 2-3 sentence summaries

- Phase handlers: handleClarification(), handlePlanning(), handleOngoing()
- gatherSources() that calls searchArxiv() with plan keywords and deduplicates results

- fetch() handler routing: GET /state returns JSON state, POST /chat processes messages

Make it production-quality with error handling and clear comments.
TypeScript strict mode.
```

---

## 4. arXiv Tool Prompt

**Used to:** Generate the external API tool integration.

```
Write a TypeScript module for a Cloudflare Worker that searches the arXiv public API.

Function signature:
  searchArxiv(query: string, maxResults: number): Promise<ArxivPaper[]>

ArxivPaper interface:
  id, title, authors[], abstract, link, publishedDate, categories[]

Requirements:
- Use arXiv API v1: https://export.arxiv.org/api/query
- Parse Atom XML response without a DOM parser (string-based parsing for Workers)
- Handle HTTP errors gracefully (return empty array)
- Clean whitespace and XML entities from text fields
- Extract the alternate link for each paper

No API key required — this is a public API.
Add clear documentation comments.
```

---

## 5. Worker Entry Point + Routing Prompt

**Used to:** Generate the Worker fetch handler and routing logic.

```
Write a Cloudflare Worker entry point (index.ts) that:

1. Exports the ResearchAgent Durable Object class
2. Handles CORS (OPTIONS preflight + headers on all responses)
3. Routes POST /api/chat to the appropriate Durable Object instance
   - Parse workspaceId from body (or generate new UUID)
   - Use env.RESEARCH_AGENT.idFromName(workspaceId)
   - Forward request to Durable Object
   - Return response with X-Workspace-Id header
4. Routes GET /api/workspace/:id to fetch Durable Object state
5. Routes GET /api/workspaces to list all workspace keys from KV
6. Implements the scheduled() handler that calls refreshAllResearch()

Env interface: RESEARCH_AGENT (DurableObjectNamespace), AI (Ai), RESEARCH_KV (KVNamespace)
TypeScript strict mode. Include error handling.
```

---

## 6. Daily Refresh Workflow Prompt

**Used to:** Generate the cron-triggered background workflow.

```
Write a Cloudflare Workers scheduled workflow function called refreshAllResearch(env).

It should:
1. List all workspace keys from KV using list({ prefix: 'workspace:' })
2. For each workspace, call refreshWorkspace(env, workspaceId)
3. refreshWorkspace should:
   a. Fetch current workspace state via GET to the Durable Object
   b. Skip if phase !== 'ongoing'
   c. Search arXiv for new papers using the workspace topic
   d. Find papers not already in workspace.sources (by ID)
   e. Post a chat message to the Durable Object with the new paper list
4. Log progress and handle errors per-workspace (don't let one failure stop others)

This runs daily at 2am UTC via cron: "0 2 * * *"
```

---

## 7. React Chat UI Prompt

**Used to:** Generate the frontend chat interface.

```
Build a production-quality React chat UI in TypeScript for an academic research agent.

Design requirements:
- Dark theme (#0f172a background, orange (#f97316) as accent color)
- Collapsible sidebar with workspace ID and command reference
- Phase progress indicator showing: Scoping → Planning → Searching → Reading → Active
- Chat message bubbles: user messages right-aligned orange, assistant messages left-aligned dark
- Auto-scrolling message list
- Textarea input that auto-expands with Shift+Enter for newlines, Enter to send
- Quick action chip buttons that appear in "ongoing" phase
- Animated typing indicator (3 pulsing dots)
- Paper count displayed in the phase indicator
- localStorage to persist workspaceId across page refreshes

API integration:
- POST to VITE_API_URL/api/chat with { workspaceId, message }
- Capture X-Workspace-Id response header on first message
- Update phase and sourceCount from response JSON

No external UI library — pure React + inline styles.
```

---

## 8. PhaseIndicator Component Prompt

**Used to:** Generate the research phase visualization component.

```
Create a React component PhaseIndicator that visualizes research workflow progress.

Props: { phase: Phase, sourceCount: number }

Phases in order: clarification, planning, gathering, summarizing, ongoing
Each has an icon and label.

Visual design:
- Horizontal strip with chevron separators between phases
- Current phase: orange highlight with orange border
- Completed phases: green tint with checkmark
- Future phases: muted gray
- Paper count shown on the right when > 0
- Horizontally scrollable on mobile

Pure React + inline styles, no dependencies.
```

---

## 9. wrangler.toml Configuration Prompt

**Used to:** Generate the correct Cloudflare Worker configuration.

```
Write a wrangler.toml for a Cloudflare Worker with:
- Name: cf-ai-academic-research-agent
- TypeScript entry: src/index.ts
- compatibility_date: 2024-01-01
- nodejs_compat flag enabled

Bindings:
- Workers AI binding named AI
- KV namespace binding named RESEARCH_KV (with placeholder IDs)
- Durable Object binding named RESEARCH_AGENT pointing to ResearchAgent class

Durable Object migration: tag v1, new_classes: [ResearchAgent]

Cron trigger: 0 2 * * * (daily at 2am UTC)
Build command: npm run build

Include comments explaining each section.
```

---

## 10. README Prompt

**Used to:** Generate the project documentation.

```
Write a comprehensive README.md for a Cloudflare Workers project called cf_ai_academic_research_agent.

Include:
1. Project overview (stateful AI research agent)
2. ASCII architecture diagram showing: Pages frontend → Worker → Durable Object → Workers AI + arXiv + KV
3. Table of Cloudflare services and how each is used
4. Step-by-step setup instructions (clone → install → create KV → deploy worker → configure frontend → deploy pages)
5. Usage guide with example conversation flow
6. Project directory structure
7. Key design decisions section (why Durable Objects, why Llama 3.3 FP8, why arXiv)

Format: clean GitHub-flavored Markdown with emoji headers.
Targeted at: Cloudflare internship reviewers who will evaluate architecture decisions.
```

---

*These prompts were used iteratively, with refinements based on Workers-specific constraints
(e.g., no DOM parser available, arXiv Atom XML must be parsed with string matching),
TypeScript strict mode requirements, and Cloudflare Durable Object API specifics.*
