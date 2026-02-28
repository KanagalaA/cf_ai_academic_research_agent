import React from 'react';

type Phase = 'clarification' | 'planning' | 'gathering' | 'summarizing' | 'ongoing';

interface Props {
  phase: Phase;
  sourceCount: number;
}

const PHASES: { key: Phase; label: string; icon: string }[] = [
  { key: 'clarification', label: 'Scoping', icon: '💬' },
  { key: 'planning', label: 'Planning', icon: '📋' },
  { key: 'gathering', label: 'Searching', icon: '🔍' },
  { key: 'summarizing', label: 'Reading', icon: '📖' },
  { key: 'ongoing', label: 'Active', icon: '✅' },
];

export function PhaseIndicator({ phase, sourceCount }: Props) {
  const currentIndex = PHASES.findIndex(p => p.key === phase);

  return (
    <div style={{
      display: 'flex', gap: '6px', alignItems: 'center',
      padding: '8px 16px',
      background: 'rgba(255,255,255,0.04)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      overflowX: 'auto',
    }}>
      {PHASES.map((p, i) => {
        const isActive = p.key === phase;
        const isDone = i < currentIndex;
        return (
          <React.Fragment key={p.key}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: isActive ? 'rgba(249,115,22,0.2)' : isDone ? 'rgba(34,197,94,0.15)' : 'transparent',
              border: isActive ? '1px solid rgba(249,115,22,0.4)' : isDone ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
              color: isActive ? '#fb923c' : isDone ? '#4ade80' : '#64748b',
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}>
              <span>{p.icon}</span>
              <span>{p.label}</span>
              {isDone && <span>✓</span>}
            </div>
            {i < PHASES.length - 1 && (
              <span style={{ color: '#334155', fontSize: '10px' }}>›</span>
            )}
          </React.Fragment>
        );
      })}
      {sourceCount > 0 && (
        <span style={{
          marginLeft: 'auto', fontSize: '12px', color: '#94a3b8',
          whiteSpace: 'nowrap',
        }}>
          📚 {sourceCount} papers
        </span>
      )}
    </div>
  );
}
