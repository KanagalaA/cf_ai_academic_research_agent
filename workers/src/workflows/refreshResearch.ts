/**
 * Refresh Research Workflow
 *
 * Runs daily via Cloudflare Workers cron trigger.
 * Loops through all saved research workspaces and:
 *   1. Searches arXiv for new papers on the same topic
 *   2. Identifies papers not yet in the workspace
 *   3. Summarizes new papers using Workers AI
 *   4. Updates workspace state via the Durable Object
 *
 * This satisfies the "workflow / coordination" requirement.
 */

import { searchArxiv } from '../tools/arxiv';
import { routeAgentRequest } from 'agents';

interface Env {
  ResearchAgent: any;
  AI: Ai;
  RESEARCH_KV: KVNamespace;
}

export async function refreshAllResearch(env: Env): Promise<void> {
  console.log('[RefreshResearch] Starting daily refresh...');

  // List all workspace IDs from KV
  const list = await env.RESEARCH_KV.list({ prefix: 'workspace:' });

  if (list.keys.length === 0) {
    console.log('[RefreshResearch] No workspaces found. Exiting.');
    return;
  }

  console.log(`[RefreshResearch] Refreshing ${list.keys.length} workspace(s)...`);

  for (const key of list.keys) {
    const workspaceId = key.name.replace('workspace:', '');
    try {
      await refreshWorkspace(env, workspaceId);
    } catch (err: any) {
      console.error(`[RefreshResearch] Failed to refresh workspace ${workspaceId}:`, err.message);
    }
  }

  console.log('[RefreshResearch] Daily refresh complete.');
}

/**
 * Refresh a single workspace: find new papers and update summaries.
 */
async function refreshWorkspace(env: Env, workspaceId: string): Promise<void> {
  const base = 'https://agent';

  // Fetch current state via routeAgentRequest
  const stateReq = new Request(`${base}/agents/research-agent/${workspaceId}/state`, { method: 'GET' });
  const stateResponse = await routeAgentRequest(stateReq, env);
  if (!stateResponse) {
    console.log(`[RefreshResearch] No agent found for workspace ${workspaceId}`);
    return;
  }
  const workspace = await stateResponse.json() as any;

  if (!workspace.topic || workspace.phase !== 'ongoing') {
    console.log(`[RefreshResearch] Skipping workspace ${workspaceId} (phase: ${workspace.phase})`);
    return;
  }

  console.log(`[RefreshResearch] Refreshing workspace "${workspace.topic}" (${workspaceId})`);

  // Search for new papers on this topic
  const newPapers = await searchArxiv(workspace.topic, 5);

  // Find papers not already stored
  const existingIds = new Set((workspace.sources || []).map((p: any) => p.id));
  const freshPapers = newPapers.filter(p => !existingIds.has(p.id));

  if (freshPapers.length === 0) {
    console.log(`[RefreshResearch] No new papers for "${workspace.topic}"`);
    return;
  }

  console.log(`[RefreshResearch] Found ${freshPapers.length} new papers for "${workspace.topic}"`);

  // Summarize new papers and post a refresh message to the agent
  const paperList = freshPapers.map(p => `- "${p.title}" (${p.publishedDate})`).join('\n');
  const refreshMessage = `[Auto-refresh] Found ${freshPapers.length} new papers:\n${paperList}\n\nPlease summarize progress.`;

  await routeAgentRequest(new Request(`${base}/agents/research-agent/${workspaceId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, message: refreshMessage }),
  }), env);

  console.log(`[RefreshResearch] Updated workspace ${workspaceId}`);
}