import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from './components/ChatMessage';
import { PhaseIndicator } from './components/PhaseIndicator';

// ─── Config ──────────────────────────────────────────────────────────────────

// In production, set this to your deployed Worker URL.
// For local dev, use http://localhost:8787
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

type Phase = 'clarification' | 'planning' | 'gathering' | 'summarizing' | 'ongoing';

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '👋 Welcome to the Academic Research Agent!\n\nI\'ll help you scope, plan, and conduct a literature review on any topic.\n\nTo get started, tell me: **What topic would you like to research?**',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('clarification');
  const [sourceCount, setSourceCount] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Always start a fresh workspace on page load to avoid stale phase issues
  useEffect(() => {
    const freshId = crypto.randomUUID();
    localStorage.setItem('researchWorkspaceId', freshId);
    setWorkspaceId(freshId);
  }, []);

  const generatePlan = useCallback(async () => {
    if (isLoading || phase !== 'clarification') return;
    setIsLoading(true);

    setMessages(prev => [...prev, {
      role: 'user',
      content: '📋 Generate my research plan',
      timestamp: Date.now(),
    }]);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, message: '__GENERATE_PLAN__' }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as {
        message: string; phase: Phase; sourceCount: number; workspaceId: string;
      };

      setPhase(data.phase);
      setSourceCount(data.sourceCount || 0);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        timestamp: Date.now(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${err.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [isLoading, phase, workspaceId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setIsLoading(true);

    // Add user message immediately
    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, message: text }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as {
        message: string;
        phase: Phase;
        sourceCount: number;
        workspaceId: string;
      };

      // Capture workspace ID — prefer JSON body (always present), fall back to header
      const newWorkspaceId = data.workspaceId || res.headers.get('X-Workspace-Id');
      if (newWorkspaceId && !workspaceId) {
        setWorkspaceId(newWorkspaceId);
        localStorage.setItem('researchWorkspaceId', newWorkspaceId);
      }

      setPhase(data.phase);
      setSourceCount(data.sourceCount || 0);

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${err.message}. Please check the Worker is running and try again.`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, workspaceId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewWorkspace = () => {
    // Generate a fresh ID immediately so the next message goes to a clean DO instance
    const freshId = crypto.randomUUID();
    localStorage.setItem('researchWorkspaceId', freshId);
    setWorkspaceId(freshId);
    setPhase('clarification');
    setSourceCount(0);
    setMessages([{
      role: 'assistant',
      content: '✨ New research workspace created!\n\nWhat topic would you like to research?',
      timestamp: Date.now(),
    }]);
  };

  // Quick-action suggestions based on phase
  const quickActions = phase === 'ongoing' ? [
    'Summarize progress',
    'Show sources',
    'Add more sources',
    'What are the key findings?',
  ] : [];

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#0f172a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#e2e8f0',
    }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: showSidebar ? '240px' : '52px',
        overflow: 'hidden',
        background: '#0a1628',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        transition: 'width 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ padding: '16px', minWidth: '240px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: '#f97316', whiteSpace: 'nowrap' }}>
            🎓 ResearchAgent
          </div>

          <button
            onClick={startNewWorkspace}
            style={{
              width: '100%', padding: '10px', borderRadius: '8px',
              background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)',
              color: '#fb923c', cursor: 'pointer', fontSize: '13px', marginBottom: '12px',
            }}>
            + New Workspace
          </button>

          {/* Generate Plan Button — only shown during clarification */}
          {phase === 'clarification' && (
            <>
              <button
                onClick={generatePlan}
                disabled={isLoading}
                style={{
                  width: '100%', padding: '12px 10px', borderRadius: '8px',
                  background: isLoading
                    ? 'rgba(255,255,255,0.04)'
                    : 'linear-gradient(135deg, rgba(249,115,22,0.9), rgba(234,88,12,0.9))',
                  border: 'none',
                  color: isLoading ? '#475569' : '#fff',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '13px', fontWeight: 600,
                  marginBottom: '6px',
                  transition: 'all 0.2s ease',
                  boxShadow: isLoading ? 'none' : '0 2px 12px rgba(249,115,22,0.3)',
                }}>
                {isLoading ? '⏳ Generating...' : '🗺️ Generate Research Plan'}
              </button>
              <div style={{ fontSize: '11px', color: '#475569', marginBottom: '24px', textAlign: 'center' }}>
                click when you're ready
              </div>
            </>
          )}

          {workspaceId && (
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              <div style={{ marginBottom: '8px', color: '#94a3b8' }}>Active Workspace</div>
              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: '6px',
                padding: '8px', wordBreak: 'break-all',
                fontFamily: 'monospace', fontSize: '11px',
              }}>{workspaceId}</div>
            </div>
          )}

          <div style={{ marginTop: '24px', fontSize: '12px', color: '#475569' }}>
            <div style={{ marginBottom: '8px', color: '#64748b' }}>Commands</div>
            <div style={{ lineHeight: '2' }}>
              <div>• "summarize progress"</div>
              <div>• "show sources"</div>
              <div>• "add more sources"</div>
              <div>• "continue research"</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Chat Area ── */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <header style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: '12px',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <button
            onClick={() => setShowSidebar(s => !s)}
            style={{
              background: 'none', border: 'none', color: '#94a3b8',
              cursor: 'pointer', fontSize: '18px', padding: '4px',
            }}>
            ☰
          </button>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>Academic Research Agent</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <a
              href="https://github.com/YOUR_USERNAME/cf_ai_academic_research_agent"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#64748b', fontSize: '12px', textDecoration: 'none' }}>
              GitHub ↗
            </a>
          </div>
        </header>

        {/* Phase Indicator */}
        <PhaseIndicator phase={phase} sourceCount={sourceCount} />

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '24px 20px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {messages.map((msg, i) => (
              <ChatMessage key={i} role={msg.role} content={msg.content} />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px',
                }}>🎓</div>
                <div style={{
                  background: 'rgba(255,255,255,0.06)', borderRadius: '18px 18px 18px 4px',
                  padding: '14px 18px', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: '#f97316',
                        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Quick Actions */}
        {quickActions.length > 0 && (
          <div style={{
            padding: '8px 20px', display: 'flex', gap: '8px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            overflowX: 'auto',
          }}>
            {quickActions.map(action => (
              <button
                key={action}
                onClick={() => {
                  setInput(action);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                style={{
                  padding: '6px 14px', borderRadius: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#94a3b8', cursor: 'pointer', fontSize: '12px',
                  whiteSpace: 'nowrap',
                }}>
                {action}
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{
            maxWidth: '800px', margin: '0 auto',
            display: 'flex', gap: '12px', alignItems: 'flex-end',
          }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about your research..."
                rows={1}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: '#e2e8f0',
                  fontSize: '14px',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: '1.5',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                background: input.trim() && !isLoading
                  ? 'linear-gradient(135deg, #f97316, #ea580c)'
                  : 'rgba(255,255,255,0.06)',
                border: 'none',
                color: input.trim() && !isLoading ? '#fff' : '#475569',
                cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                fontSize: '18px',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}>
              ↑
            </button>
          </div>
          <div style={{
            maxWidth: '800px', margin: '8px auto 0',
            fontSize: '11px', color: '#334155', textAlign: 'center',
          }}>
            Powered by Cloudflare Workers AI (Llama 3.3) + arXiv • Press Enter to send
          </div>
        </div>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        textarea::placeholder { color: #475569; }
      `}</style>
    </div>
  );
}