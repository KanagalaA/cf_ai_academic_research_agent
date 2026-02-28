/**
 * ResearchAgent — Stateful Academic Research Assistant
 *
 * Architecture notes on state + history:
 *
 * PROBLEM: Multiple setState() calls in one request clobber each other because
 * each call spreads `this.state` which may not reflect previous calls yet.
 * Also, pushToHistory() runs AFTER the handler returns, so history is always
 * one exchange behind when building LLM context.
 *
 * SOLUTION:
 * 1. Use a single setState() call per request with all mutations batched.
 * 2. Push the PREVIOUS exchange (pendingUserMsg + pendingAssistantMsg) at the
 *    START of each request, before building any context. This means history is
 *    always complete and accurate for the current LLM call.
 * 3. Store pending messages in state so they survive across requests.
 */

import { Agent } from 'agents';
import { searchArxiv, ArxivPaper } from './tools/arxiv';

interface Env {
  ResearchAgent: any;
  AI: Ai;
  RESEARCH_KV: KVNamespace;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ResearchPlan {
  subtopics: string[];
  keywords: string[];
  outline: string[];
  createdAt: string;
}

export interface PaperInsight {
  paperId: string;
  relevanceSummary: string;
  keyFindings: string;
  researchImpact: string;
}

export interface WorkspaceState {
  workspaceId: string;
  topic: string;
  researchGoals: string;
  phase: 'clarification' | 'planning' | 'gathering' | 'summarizing' | 'ongoing';
  clarifications: {
    academic_level?: string;
    purpose?: string;
    focus_area?: string;
  };
  plan: ResearchPlan | null;
  sources: ArxivPaper[];
  paperInsights: Record<string, PaperInsight>;
  // chatHistory is the committed, persisted history — always complete
  chatHistory: ChatMessage[];
  lastUpdated: string;
  // Pending exchange from previous request, committed at start of next request
  pendingUserMsg: string;
  pendingAssistantMsg: string;
}

// ─── Agent ─────────────────────────────────────────────────────────────────

export class ResearchAgent extends Agent<Env, WorkspaceState> {
  initialState: WorkspaceState = {
    workspaceId: '',
    topic: '',
    researchGoals: '',
    phase: 'clarification',
    clarifications: {},
    plan: null,
    sources: [],
    paperInsights: {},
    chatHistory: [],
    lastUpdated: new Date().toISOString(),
    pendingUserMsg: '',
    pendingAssistantMsg: '',
  };

  // ─── LLM ─────────────────────────────────────────────────────────────────

  private async callLLM(messages: ChatMessage[], maxTokens = 1024): Promise<string> {
    const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
    } as any);
    const result = response as any;
    const text = result.response ?? result.choices?.[0]?.message?.content ?? '';
    // Always return a string — Workers AI occasionally returns objects on error
    return typeof text === 'string' ? text : JSON.stringify(text);
  }

  // ─── Single batched setState ──────────────────────────────────────────────
  // All mutations go through this so we never clobber intermediate state.
  // We keep a local mutable copy (`draft`) and flush it once at the end.

  private draft: WorkspaceState = this.state;

  private initDraft(): void {
    // Snapshot current persisted state as the base for this request's mutations
    this.draft = { ...this.state };
  }

  private patch(updates: Partial<WorkspaceState>): void {
    this.draft = { ...this.draft, ...updates, lastUpdated: new Date().toISOString() };
  }

  private flush(): void {
    this.setState(this.draft);
  }

  // ─── Commit pending exchange from previous request ────────────────────────
  // Called at the very start of each request BEFORE reading history.
  // This ensures chatHistory is always fully up-to-date for context building.

  private commitPending(): void {
    if (this.draft.pendingUserMsg && this.draft.pendingAssistantMsg) {
      this.patch({
        chatHistory: [
          ...this.draft.chatHistory,
          { role: 'user', content: this.draft.pendingUserMsg },
          { role: 'assistant', content: this.draft.pendingAssistantMsg },
        ],
        pendingUserMsg: '',
        pendingAssistantMsg: '',
      });
    }
  }

  // ─── Phase 1: Clarification ────────────────────────────────────────────────

  private async handleClarification(userMessage: string): Promise<string> {
    // Plan is only triggered by the explicit button sentinel — never by keywords
    if (userMessage === '__GENERATE_PLAN__') {
      if (!this.draft.topic) {
        return "Please tell me your research topic first before generating a plan.";
      }
      this.patch({ phase: 'planning' });
      return await this.handlePlanning();
    }

    // Set topic only from the very first message — never overwrite
    if (!this.draft.topic) {
      this.patch({ topic: userMessage });
    }

    this.extractFactsFromMessage(userMessage);

    // Build Q&A pairs from history.
    // Because commitPending() ran at the top of the request, chatHistory is
    // fully up-to-date — it already includes all previous exchanges including
    // the one that was pending from last request.
    //
    // Layout: [user(topic), asst(Q1), user(A1), asst(Q2), user(A2)...]
    // Index 0 = topic message (skip it)
    // Pairs: (history[1], history[2]), (history[3], history[4]), ...
    const history = this.draft.chatHistory;

    const qaPairs: string[] = [];
    for (let i = 1; i < history.length - 1; i += 2) {
      const aQ = history[i];
      const uA = history[i + 1];
      if (aQ?.role === 'assistant' && uA?.role === 'user') {
        qaPairs.push('You asked: ' + aQ.content.trim() + '\nUser answered: ' + uA.content.trim());
      }
    }

    // The last assistant message is the question the user is now answering
    // (it's in history because commitPending() already flushed it)
    const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
    const currentPair = lastAssistantMsg
      ? 'You asked: ' + lastAssistantMsg.content.trim() + '\nUser answered: ' + userMessage.trim()
      : null;

    // allPairs = all committed pairs + the current live exchange
    const allPairs = currentPair ? [...qaPairs, currentPair] : qaPairs;

    const askedQuestions = history
      .filter(m => m.role === 'assistant')
      .map(m => '"' + m.content.trim() + '"');

    const topic = this.draft.topic || userMessage;

    const systemLines = [
      'You are a research scoping assistant. The user wants to research: ' + topic,
      '',
      'FULL CONVERSATION SO FAR (all Q&A exchanges including the current one):',
      allPairs.length > 0 ? allPairs.join('\n\n') : '(no exchanges yet — ask the first clarifying question)',
      '',
      'QUESTIONS YOU HAVE ALREADY ASKED — DO NOT REPEAT OR REPHRASE ANY OF THESE:',
      askedQuestions.length > 0 ? askedQuestions.join('\n') : '(none yet)',
      '',
      'YOUR TASK: Ask ONE short follow-up question to clarify scope, focusing on:',
      '- The specific technical problem or application they want to explore',
      '- The desired output or result from the research',
      '- Scope, approach, or constraints that matter to them',
      '',
      'STRICT RULES:',
      '- Ask ONLY ONE question.',
      '- Do NOT repeat or rephrase any already-asked question.',
      '- Do NOT ask about academic level or personal background.',
      '- Keep it short and specific to: ' + topic,
      '- Do NOT suggest or mention generating a plan — the user has a dedicated button for that.',
      '',
      'Write ONLY your question. No preamble, no offer to generate a plan.',
    ];

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemLines.join('\n') },
      { role: 'user', content: userMessage },
    ];

    const raw = await this.callLLM(llmMessages, 256);
    const cleaned = this.cleanOutput(raw);

    return cleaned;
  }

  private extractFactsFromMessage(msg: string): void {
    const lower = msg.toLowerCase();
    const c = this.draft.clarifications;
    const patch: Partial<typeof c> = {};

    if (!c.academic_level) {
      if (/(undergrad|undergraduate|bachelor)/i.test(lower)) patch.academic_level = 'undergraduate';
      else if (/(phd|doctoral|doctorate)/i.test(lower)) patch.academic_level = 'PhD student';
      else if (/(grad student|graduate student|masters student)/i.test(lower)) patch.academic_level = 'graduate student';
    }
    if (!c.purpose) {
      if (/(thesis|dissertation)/i.test(lower)) patch.purpose = 'thesis';
      else if (/(paper|publication|publish)/i.test(lower)) patch.purpose = 'research paper';
      else if (/(class|course|assignment|homework)/i.test(lower)) patch.purpose = 'class assignment';
      else if (/(curious|curiosity|interest|learning|explore)/i.test(lower)) patch.purpose = 'personal curiosity';
    }
    if (!c.focus_area && msg.trim().split(/\s+/).length > 6 && this.draft.topic) {
      patch.focus_area = msg.trim();
    }

    if (Object.keys(patch).length > 0) {
      this.patch({ clarifications: { ...c, ...patch } });
    }
  }


  private cleanOutput(raw: string): string {
    return raw
      .replace(/\[\[(?!OFFER_PLAN).*?\]\]/gi, '')
      .replace(/Wait, I apologize[\s\S]*$/i, '')
      .replace(/Here'?s (the|my) (corrected|actual|revised) response:?\s*/gi, '')
      .replace(/^(Assistant|AI|Bot):\s*/i, '')
      .trim();
  }

  // ─── Phase 2: Planning ─────────────────────────────────────────────────────

  private async handlePlanning(): Promise<string> {
    const plan = await this.generatePlan();
    const researchGoals = this.buildContextSummary();
    this.patch({ plan, phase: 'gathering', researchGoals });

    const lines = [
      '📋 **Research Plan**',
      '',
      '**Topic:** ' + this.draft.topic,
      '',
      '**Subtopics to explore:**',
      ...plan.subtopics.map(s => '  • ' + s),
      '',
      '**Search keywords:**',
      ...plan.keywords.map(k => '  • ' + k),
      '',
      '**Suggested outline:**',
      ...plan.outline.map((o, i) => '  ' + (i + 1) + '. ' + o),
      '',
      '🔍 Searching arXiv for relevant papers now...',
    ];

    // Await synchronously — gather updates draft+state incrementally as papers come in
    await this.gatherAndAnalyzeSources();

    return lines.join('\n');
  }

  private async generatePlan(): Promise<ResearchPlan> {
    // Build a full Q&A transcript from chat history so the LLM has all context
    // History layout: [user(topic), asst(Q1), user(A1), asst(Q2), user(A2)...]
    const history = this.draft.chatHistory;
    const qaTranscript = history.slice(1).map(m =>
      (m.role === 'assistant' ? 'Question: ' : 'Answer: ') + m.content.trim()
    ).join('\n');

    const systemPrompt = [
      'You are a research planning expert. Generate a detailed, specific research plan based on the conversation below.',
      'Return ONLY a valid JSON object — no markdown, no backticks, no explanation, nothing else.',
      'The JSON must have exactly these keys: subtopics (array of 5-6 strings), keywords (array of 8-12 strings), outline (array of 6-8 strings).',
      'Make every item specific to the actual topic and clarifications discussed — never use generic placeholders.',
      'For keywords: use precise technical terms suitable for arXiv searches (e.g. "echocardiogram video classification CNN" not just "echocardiogram").',
    ].join('\n');

    const userPrompt = [
      'Research topic: ' + this.draft.topic,
      '',
      'Clarification conversation:',
      qaTranscript || '(no clarification conversation yet)',
      '',
      'Generate the JSON research plan now:',
    ].join('\n');

    const rawResult = await this.callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 1024);

    // callLLM may return non-string in edge cases — normalize defensively
    const raw = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult ?? '');
    console.log('Plan LLM raw output:', raw.slice(0, 500));

    // Try multiple JSON extraction strategies
    let parsed: any = null;

    // Strategy 1: direct parse
    try { parsed = JSON.parse(raw.trim()); } catch {}

    // Strategy 2: extract first {...} block
    if (!parsed) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    // Strategy 3: strip markdown fences and try again
    if (!parsed) {
      const stripped = raw.replace(/```json|```/gi, '').trim();
      try { parsed = JSON.parse(stripped); } catch {}
    }

    if (parsed && typeof parsed === 'object') {
      const subtopics = Array.isArray(parsed.subtopics) ? parsed.subtopics.filter(Boolean) : [];
      const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter(Boolean) : [];
      const outline = Array.isArray(parsed.outline) ? parsed.outline.filter(Boolean) : [];

      // Only accept if we got real content
      if (subtopics.length > 0 && keywords.length > 0) {
        return { subtopics, keywords, outline, createdAt: new Date().toISOString() };
      }
    }

    // Smart fallback: derive from topic + conversation context instead of pure generics
    console.error('Plan JSON parse failed, using smart fallback. Raw:', raw.slice(0, 200));
    const topic = this.draft.topic;
    const lowerHistory = qaTranscript.toLowerCase();
    const usesAI = lowerHistory.includes('ai') || lowerHistory.includes('machine learning') || lowerHistory.includes('deep learning');
    const usesVideo = lowerHistory.includes('video');
    const usesImage = lowerHistory.includes('image') || lowerHistory.includes('imaging');

    return {
      subtopics: [
        topic + ' fundamentals and clinical significance',
        usesAI ? 'Deep learning approaches for ' + topic + ' analysis' : 'Image analysis techniques for ' + topic,
        usesVideo ? 'Video-based ' + topic + ' processing methods' : 'Advanced ' + topic + ' processing methods',
        'Benchmark datasets and evaluation metrics',
        'Transfer learning and pre-trained model adaptation',
        'Clinical validation and deployment challenges',
      ],
      keywords: [
        topic,
        topic + ' deep learning',
        topic + ' ' + (usesVideo ? 'video analysis' : 'image analysis'),
        topic + ' neural network',
        topic + ' classification',
        topic + ' segmentation',
        'cardiac ' + (usesAI ? 'AI diagnosis' : 'image processing'),
        'echocardiography machine learning',
      ],
      outline: [
        'Introduction and clinical motivation',
        'Background: ' + topic + ' and cardiac imaging',
        'Related work: AI in medical imaging',
        'Methodology: model architecture and training',
        'Experiments and results',
        'Discussion and limitations',
        'Conclusion and future work',
      ],
      createdAt: new Date().toISOString(),
    };
  }

  private buildContextSummary(): string {
    const c = this.draft.clarifications;
    const parts = ['Topic: ' + this.draft.topic];
    if (c.focus_area) parts.push('Focus: ' + c.focus_area);
    if (c.purpose) parts.push('Purpose: ' + c.purpose);
    if (c.academic_level) parts.push('Level: ' + c.academic_level);
    return parts.join(' | ');
  }

  // ─── Phase 3 & 4: Gather + Analyze ────────────────────────────────────────

  private async gatherAndAnalyzeSources(): Promise<void> {
    // Use draft.plan when called synchronously (within a request),
    // fall back to this.state.plan when called as a follow-up (e.g. "add more sources")
    const plan = this.draft.plan || this.state.plan;
    if (!plan) { console.error('gatherAndAnalyzeSources: no plan found'); return; }

    console.log('Starting arXiv search with keywords:', plan.keywords.slice(0, 4));

    const allPapers: ArxivPaper[] = [];
    for (const kw of plan.keywords.slice(0, 4)) {
      try { allPapers.push(...await searchArxiv(kw, 5)); }
      catch (e) { console.error('arXiv error for keyword "' + kw + '":', e); }
    }

    console.log('arXiv total papers fetched:', allPapers.length);

    const seen = new Set<string>();
    const sources = allPapers.filter(p => !seen.has(p.id) && seen.add(p.id));

    // Patch draft (synchronous path) AND persist immediately so interruptions don't lose data
    this.patch({ sources, phase: 'summarizing' });
    this.setState({ ...this.draft });

    const paperInsights: Record<string, PaperInsight> = { ...this.draft.paperInsights };
    for (const paper of sources.slice(0, 8)) {
      try {
        paperInsights[paper.id] = await this.analyzePaper(paper);
        this.patch({ paperInsights });
        this.setState({ ...this.draft });
      } catch (e) { console.error('Analysis failed for paper:', paper.id, e); }
    }

    this.patch({ phase: 'ongoing' });
    this.setState({ ...this.draft });
    console.log('Gathering complete. Sources:', sources.length, 'Insights:', Object.keys(paperInsights).length);
  }

  private async analyzePaper(paper: ArxivPaper): Promise<PaperInsight> {
    const prompt = 'Researcher context: ' + this.buildContextSummary()
      + '\n\nAnalyze:\nTitle: ' + paper.title
      + '\nAbstract: ' + paper.abstract.substring(0, 600)
      + '\n\nReturn ONLY valid JSON:\n'
      + '{"relevanceSummary":"why relevant (1-2 sentences)","keyFindings":"main contribution (1-2 sentences)","researchImpact":"how to use this (1-2 sentences)"}';

    try {
      const raw = await this.callLLM([
        { role: 'system', content: 'Return only valid JSON, no explanation.' },
        { role: 'user', content: prompt },
      ], 512);
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        return {
          paperId: paper.id,
          relevanceSummary: p.relevanceSummary || '',
          keyFindings: p.keyFindings || '',
          researchImpact: p.researchImpact || '',
        };
      }
    } catch (e) { console.error('Paper analysis failed:', e); }

    return { paperId: paper.id, relevanceSummary: '', keyFindings: '', researchImpact: '' };
  }

  // ─── Phase 5: Ongoing ─────────────────────────────────────────────────────

  private async handleOngoing(userMessage: string): Promise<string> {
    const lower = userMessage.toLowerCase();

    if (lower.includes('show progress') || lower.includes('summarize progress')) return this.buildProgressSummary();
    if (lower.includes('show papers') || lower.includes('show sources') || lower.includes('list papers')) return this.buildPapersList();
    if (lower.includes('find more') || lower.includes('add more') || lower.includes('more papers')) {
      void this.gatherAndAnalyzeSources();
      return '🔍 Searching for more papers. Say "show progress" to check.';
    }

    const papersCtx = this.draft.sources.slice(0, 8).map(p => {
      const ins = this.draft.paperInsights[p.id];
      return '"' + p.title + '" (' + p.publishedDate + ')'
        + (ins ? '\n  Relevance: ' + ins.relevanceSummary : '')
        + (ins ? '\n  Findings: ' + ins.keyFindings : '')
        + (ins ? '\n  Usage: ' + ins.researchImpact : '');
    }).join('\n\n');

    const system = 'You are an expert research assistant for: "' + this.draft.topic + '"'
      + '\nContext: ' + this.buildContextSummary()
      + '\nPapers:\n' + (papersCtx || 'Still gathering.')
      + '\nAnswer directly. Reference papers by name when relevant.';

    return await this.callLLM([
      { role: 'system', content: system },
      ...this.draft.chatHistory.slice(-10),
      { role: 'user', content: userMessage },
    ], 1024);
  }

  // ─── Display ──────────────────────────────────────────────────────────────

  private buildProgressSummary(): string {
    const s = this.draft;
    const lines = ['📊 **Research Progress**', '**Topic:** ' + s.topic, '**Phase:** ' + s.phase, ''];
    if (s.researchGoals) lines.push('**Context:** ' + s.researchGoals, '');
    if (s.plan) lines.push('**Plan:** ✅ ' + s.plan.subtopics.length + ' subtopics, ' + s.plan.keywords.length + ' keywords', '');
    lines.push('**Papers found:** ' + s.sources.length, '**Papers analyzed:** ' + Object.keys(s.paperInsights).length);
    return lines.join('\n');
  }

  private buildPapersList(): string {
    const s = this.draft;
    if (!s.sources.length) return 'No papers yet. Ask me to "find more papers".';
    const lines = ['📚 **' + s.sources.length + ' Papers Found**', ''];
    s.sources.slice(0, 10).forEach((p, i) => {
      const ins = s.paperInsights[p.id];
      lines.push('**' + (i + 1) + '. ' + p.title + '**');
      lines.push('   ' + p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '') + ' · ' + p.publishedDate);
      lines.push('   🔗 ' + p.link);
      if (ins) {
        lines.push('   **Why it matters:** ' + ins.relevanceSummary);
        lines.push('   **Key finding:** ' + ins.keyFindings);
        lines.push('   **How to use it:** ' + ins.researchImpact);
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  // ─── Request handler ──────────────────────────────────────────────────────

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname.endsWith('/state') && request.method === 'GET') {
      return new Response(JSON.stringify(this.state), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (url.pathname.endsWith('/chat') && request.method === 'POST') {
      const body = await request.json() as { workspaceId: string; message: string };
      const userMessage = body.message.trim();

      // ── Step 1: init the draft from current persisted state ────────────────
      this.initDraft();

      // ── Step 2: commit the pending exchange from the PREVIOUS request ──────
      // This ensures chatHistory is fully up-to-date before we build any context.
      this.commitPending();

      // ── Step 3: set workspaceId if first request ───────────────────────────
      if (!this.draft.workspaceId && body.workspaceId) {
        this.patch({ workspaceId: body.workspaceId });
      }

      // ── Step 4: dispatch to phase handler ─────────────────────────────────
      let response: string;
      try {
        switch (this.draft.phase) {
          case 'clarification': response = await this.handleClarification(userMessage); break;
          case 'planning': response = await this.handlePlanning(); break;
          case 'gathering':
          case 'summarizing':
            // If papers are already done (background task finished before this request),
            // auto-transition to ongoing so the user isn't stuck
            if (this.draft.sources.length > 0 && Object.keys(this.draft.paperInsights).length > 0) {
              this.patch({ phase: 'ongoing' });
              response = await this.handleOngoing(userMessage);
            } else {
              response = '⏳ Still gathering papers (' + this.draft.sources.length + ' found so far). Try again in a moment, or say "show progress".';
            }
            break;
          case 'ongoing':
          default:
            response = await this.handleOngoing(userMessage);
        }
      } catch (err: any) {
        console.error('Agent error:', err);
        response = 'Something went wrong: ' + err.message;
      }

      // ── Step 5: store this exchange as pending — committed next request ─────
      // Re-sync draft from persisted state after planning (gather calls setState internally)
      // so we don't clobber the phase/sources/insights that gather already wrote.
      if (this.draft.phase === 'planning' || this.state.phase === 'ongoing' || this.state.phase === 'summarizing') {
        this.initDraft(); // re-baseline from what's actually persisted
      }
      const historyUserMsg = userMessage === '__GENERATE_PLAN__' ? '📋 Generate my research plan' : userMessage;
      this.patch({ pendingUserMsg: historyUserMsg, pendingAssistantMsg: response });

      // ── Step 6: single flush of all state mutations ────────────────────────
      this.flush();

      // ── Step 7: update KV index ────────────────────────────────────────────
      if (this.draft.workspaceId) {
        await this.env.RESEARCH_KV.put(
          'workspace:' + this.draft.workspaceId,
          JSON.stringify({ topic: this.draft.topic, phase: this.draft.phase }),
          { metadata: { topic: this.draft.topic, phase: this.draft.phase } }
        );
      }

      return new Response(JSON.stringify({
        message: response,
        workspaceId: this.draft.workspaceId || body.workspaceId,
        phase: this.draft.phase,
        sourceCount: this.draft.sources.length,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404 });
  }
}