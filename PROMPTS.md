You are helping me build a production-quality project for the **Cloudflare AI Internship optional assignment**.

This project MUST be built using **Cloudflare’s Agents platform** and follow their requirements exactly.

The repository MUST be named:

```
cf_ai_academic_research_agent
```

The project must demonstrate:

* Cloudflare Workers
* Cloudflare Agents SDK
* Durable Objects (persistent state)
* Workers AI (Llama model)
* Workflow / scheduled task
* Tool usage (external API)
* Frontend chat UI (Cloudflare Pages)
* Full documentation
* PROMPTS.md containing AI prompts used

This project should feel like a **mini SaaS AI product**, not a toy demo.

---

# PROJECT OVERVIEW

We are building a **Stateful Academic Research Planning Agent**.

Instead of answering one-off questions, this agent:

* collaborates with the user to scope research
* asks clarifying questions
* creates a research plan
* gathers academic sources
* summarizes papers
* stores research workspaces persistently
* allows users to continue research over time
* runs background updates

This aligns with Cloudflare’s vision of **stateful AI agents**.

---

# CORE USER FLOW

1. User opens web app and creates a research workspace.
2. User enters research topic.
3. Agent asks clarifying questions.
4. Agent generates research plan.
5. Agent gathers academic sources using tools.
6. Agent summarizes sources using Workers AI.
7. Agent stores everything in persistent state.
8. User can return later and continue research.
9. Background job periodically refreshes research.

---

# REQUIRED CLOUDFLARE STACK

We MUST use these Cloudflare technologies.

## 1) Cloudflare Workers

Used for:

* API routes
* routing frontend → agent
* calling Workers AI

## 2) Cloudflare Agents SDK

The backend MUST be built using the **Agents framework**.

Create a class:

```
ResearchAgent extends AIChatAgent
```

The agent must:

* persist conversations
* maintain research workspaces
* call tools
* orchestrate workflows

## 3) Durable Objects (via Agents)

Each research workspace must be stored persistently.

Persist:

* research topic
* clarifying answers
* research plan
* sources gathered
* summaries
* chat history

## 4) Workers AI (LLM)

Use Llama model via:

```
@cf/meta/llama-3-8b-instruct
```

Use LLM for:

* asking clarifying questions
* generating research plan
* summarizing papers
* answering follow-up questions

## 5) External Tool Integration

Agent must call at least one external API.

Use:

* arXiv API for academic paper search
* fetch paper metadata and abstracts

This satisfies “tool usage”.

## 6) Scheduled Workflow

Add a cron job that runs daily.

Background job:

* refreshes saved research topics
* fetches new papers
* updates summaries

This satisfies “workflow/coordination”.

## 7) Cloudflare Pages Frontend

Build a simple React chat interface:

* input box
* message history
* send messages to Worker API
* display streaming responses

---

# BACKEND ARCHITECTURE

Create the following structure:

```
/workers
  /src
    index.ts              (Worker entry)
    agent.ts              (ResearchAgent class)
    tools/
        arxiv.ts          (arXiv search tool)
    workflows/
        refreshResearch.ts
```

---

# AGENT BEHAVIOR SPEC

The agent must implement these phases:

## Phase 1 — Workspace creation

When a user first sends a topic:
Agent should ask clarifying questions such as:

* research level (undergrad/grad/etc)
* purpose (paper, proposal, survey)
* focus areas
* time constraints

Store answers.

## Phase 2 — Research plan generation

Agent generates:

* key subtopics
* search keywords
* research outline

Store plan in Durable Object state.

## Phase 3 — Source gathering

Agent uses arXiv API tool to:

* search papers
* fetch titles + abstracts
* store top results

## Phase 4 — Summarization

For each paper:

* summarize abstract using Workers AI
* store summaries

## Phase 5 — Ongoing conversation

User can ask:

* “continue research”
* “summarize progress”
* “add more sources”

Agent loads stored state and continues.

---

# ARXIV TOOL REQUIREMENTS

Implement tool function:

```
searchArxiv(query: string) -> returns papers
```

Use arXiv public API via HTTP fetch.

Return:

* title
* authors
* abstract
* link
* published date

---

# CRON WORKFLOW

Daily job:

* loop through saved research workspaces
* search arXiv for new papers
* summarize new results
* update workspace memory

---

# FRONTEND REQUIREMENTS

React chat UI with:

* message list
* text input
* send button
* call Worker endpoint `/api/chat`
* display streaming responses

Keep UI simple but clean.

---

# README REQUIREMENTS

README.md must include:

* project overview
* architecture diagram (text description OK)
* Cloudflare services used
* setup instructions
* deployment instructions
* screenshots

---

# PROMPTS.MD REQUIREMENTS

Create PROMPTS.md containing:

* prompts used to generate code
* prompts used to design architecture
* prompts used to design agent behavior

This is required by Cloudflare.

---

# DEPLOYMENT

Project must be deployable with:

```
npm install
npx wrangler deploy
```

---

# QUALITY BAR

Code must be:

* clean
* modular
* well commented
* TypeScript
* production style

This is a portfolio project for a Cloudflare internship.
