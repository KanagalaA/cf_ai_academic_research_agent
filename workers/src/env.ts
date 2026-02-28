import { AgentNamespace } from 'agents';

export interface Env {
  ResearchAgent: AgentNamespace<any>;
  AI: Ai;
  RESEARCH_KV: KVNamespace;
}