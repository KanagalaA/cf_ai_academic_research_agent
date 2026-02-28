/**
 * Worker Entry Point
 *
 * routeAgentRequest handles:
 *   1. URL pattern: /agents/:agentKebabName/:instanceId[/...]
 *   2. Looks up env[PascalCase(agentKebabName)] — e.g. env.ResearchAgent
 *   3. Injects required partyserver headers (x-partykit-room, x-partykit-namespace)
 *   4. Routes to the correct Durable Object instance
 *   5. Calls onRequest() or onConnect() on the Agent
 *
 * Binding name in wrangler.toml MUST be "ResearchAgent" (= class name)
 * so routeAgentRequest can find it via kebab → PascalCase lookup.
 */

import { routeAgentRequest } from 'agents';
import { ResearchAgent } from './agent';
import { Env } from './env';
import { refreshAllResearch } from './workflows/refreshResearch';

export { ResearchAgent };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // Expose custom headers so browser JS can read them (required for cross-origin requests)
  'Access-Control-Expose-Headers': 'X-Workspace-Id',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── POST /api/chat ────────────────────────────────────────────────────────
    // Rewrite to /agents/research-agent/:workspaceId/chat
    // routeAgentRequest will inject partyserver headers and call onRequest()
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const body = await request.json() as { workspaceId?: string; message: string };
        const workspaceId = body.workspaceId || crypto.randomUUID();

        // Build a new request at the /agents/... URL that routeAgentRequest expects
        const agentUrl = new URL(request.url);
        agentUrl.pathname = `/agents/research-agent/${workspaceId}/chat`;

        const agentRequest = new Request(agentUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, workspaceId }),
        });

        const response = await routeAgentRequest(agentRequest, env);
        if (!response) {
          return new Response(
            JSON.stringify({ error: 'Agent not found — check binding name is ResearchAgent' }),
            { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
          );
        }

        // Pass through the response with CORS headers added
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: {
            ...cors,
            'Content-Type': 'application/json',
            'X-Workspace-Id': workspaceId,
          },
        });
      } catch (err: any) {
        console.error('Chat error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── GET /api/workspace/:id ────────────────────────────────────────────────
    if (url.pathname.startsWith('/api/workspace/') && request.method === 'GET') {
      const workspaceId = url.pathname.split('/').pop();
      if (!workspaceId) {
        return new Response(JSON.stringify({ error: 'Missing workspace ID' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const agentUrl = new URL(request.url);
      agentUrl.pathname = `/agents/research-agent/${workspaceId}/state`;
      const agentRequest = new Request(agentUrl.toString(), { method: 'GET' });
      const response = await routeAgentRequest(agentRequest, env);
      if (!response) return new Response('{}', { headers: { ...cors, 'Content-Type': 'application/json' } });
      const data = await response.text();
      return new Response(data, {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── GET /api/workspaces ───────────────────────────────────────────────────
    if (url.pathname === '/api/workspaces' && request.method === 'GET') {
      const list = await env.RESEARCH_KV.list({ prefix: 'workspace:' });
      const workspaces = list.keys.map(k => ({
        id: k.name.replace('workspace:', ''),
        metadata: k.metadata,
      }));
      return new Response(JSON.stringify({ workspaces }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Pass /agents/* directly to routeAgentRequest ──────────────────────────
    if (url.pathname.startsWith('/agents/')) {
      const response = await routeAgentRequest(request, env);
      if (response) return response;
    }

    return new Response(JSON.stringify({ message: 'Academic Research Agent API' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshAllResearch(env));
  },
};