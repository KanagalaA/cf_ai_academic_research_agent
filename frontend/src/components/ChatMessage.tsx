import React from 'react';

interface Props {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatMessage({ role, content }: Props) {
  const isUser = role === 'user';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '16px',
      gap: '10px',
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', flexShrink: 0,
        }}>🎓</div>
      )}
      <div style={{
        maxWidth: '75%',
        background: isUser
          ? 'linear-gradient(135deg, #f97316, #ea580c)'
          : 'rgba(255,255,255,0.06)',
        color: '#f1f5f9',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '12px 16px',
        fontSize: '14px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
        wordBreak: 'break-word',
      }}>
        {content}
      </div>
      {isUser && (
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', flexShrink: 0,
        }}>👤</div>
      )}
    </div>
  );
}
