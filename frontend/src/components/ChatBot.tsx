import { useState, useRef, useEffect, useCallback } from 'react';
import { sendChatMessage } from '../services/api';
import type { ChatMessage, ChatCSVContext, AnalysisResult } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  analysisResult: AnalysisResult | null;
}

function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const result: T[] = [arr[0]];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 1; i < n - 1; i++) result.push(arr[Math.round(i * step)]);
  result.push(arr[arr.length - 1]);
  return result;
}

function buildCSVContext(result: AnalysisResult): ChatCSVContext {
  return {
    total_records: result.total_records,
    time_range_start: result.time_range.start,
    time_range_end: result.time_range.end,
    resources: result.pairs.map(p => {
      const raw = p.raw ?? [];

      // Find timestamps of actual min/max
      let minPt = raw[0], maxPt = raw[0];
      for (const pt of raw) {
        if (pt.stock < (minPt?.stock ?? Infinity)) minPt = pt;
        if (pt.stock > (maxPt?.stock ?? -Infinity)) maxPt = pt;
      }

      // 10 evenly-spaced points from the full timeline
      const sampled = sampleEvenly(raw, 10).map(pt => ({
        timestamp: pt.timestamp,
        stock: pt.stock,
      }));

      return {
        sector_id: p.sector_id,
        resource_type: p.resource_type,
        current: p.stats.current,
        min: p.stats.min,
        max: p.stats.max,
        mean: p.stats.mean,
        std_dev: p.stats.std_dev ?? 0,
        depletion_rate: p.stats.depletion_rate,
        overall_slope: p.stats.overall_slope ?? p.stats.depletion_rate,
        r_squared: p.stats.r_squared ?? 0,
        noise_std: p.stats.noise_std ?? 0,
        trend_acceleration: p.stats.trend_acceleration ?? 0,
        predicted_zero: p.stats.predicted_zero,
        hours_to_zero: p.stats.hours_to_zero,
        status: p.stats.status,
        risk_score: p.stats.risk_score,
        data_points: p.stats.data_points,
        had_crash_recovery: p.stats.had_crash_recovery ?? false,
        min_at: minPt ? { timestamp: minPt.timestamp, stock: minPt.stock } : undefined,
        max_at: maxPt ? { timestamp: maxPt.timestamp, stock: maxPt.stock } : undefined,
        sampled_points: sampled,
        weekly_forecast: (p.weekly_forecast ?? []).map(w => ({
          day: w.day,
          projected_stock: w.projected_stock,
          date: w.date,
        })),
      };
    }),
  };
}

const GREETING = `Hey! I'm Bo, your data analysis assistant.\n\nI can help you understand your uploaded CSV data — ask me about resource trends, depletion predictions, risk levels, or anything about the dataset!`;
const NO_CSV_MSG = `Hey! I'm Bo, your data analysis assistant.\n\nLooks like you haven't uploaded a CSV file yet. Drop one into the Data Analysis Lab and I'll be ready to help you dig into the data!`;

export default function ChatBot({ open, onClose, analysisResult }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !greeted) {
      const greetMsg = analysisResult ? GREETING : NO_CSV_MSG;
      setMessages([{ role: 'assistant', content: greetMsg }]);
      setGreeted(true);
    }
  }, [open, greeted, analysisResult]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const csvCtx = analysisResult ? buildCSVContext(analysisResult) : null;
      const history = [...messages, userMsg];
      const reply = await sendChatMessage(text, csvCtx, history);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I ran into an error. Try again in a moment.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, analysisResult, messages]);

  if (!open) return null;

  return (
    <div className="chatbot-panel" style={{
      position: 'fixed', bottom: 16, left: 220,
      width: 480, maxHeight: 620, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      borderStyle: 'solid', borderWidth: 8, borderColor: 'transparent',
      borderImageSource: 'var(--sprite-basic-container)',
      borderImageSlice: '8 fill', borderImageWidth: 8,
      borderImageRepeat: 'stretch',
      imageRendering: 'pixelated',
      boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '2px solid rgba(16,185,129,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: '#10b981', boxShadow: '0 0 8px #10b981',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700, fontSize: '1.35rem',
            color: '#1a1a1a', letterSpacing: '0.04em',
          }}>
            Bo — AI Analyst
          </span>
        </div>
        <button
          onClick={onClose}
          className="chatbot-close-btn"
          title="Close chat"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="chatbot-messages" style={{
        flex: 1, overflowY: 'auto', padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 340, maxHeight: 460,
      }}>
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'chatbot-msg-user' : 'chatbot-msg-bot'}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="chatbot-msg-bot" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            color: '#888',
          }}>
            <span className="chatbot-dot" style={{ animationDelay: '0s' }}>●</span>
            <span className="chatbot-dot" style={{ animationDelay: '0.2s' }}>●</span>
            <span className="chatbot-dot" style={{ animationDelay: '0.4s' }}>●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px',
        borderTop: '2px solid rgba(16,185,129,0.25)',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder={analysisResult ? 'Ask Bo about the data...' : 'Upload a CSV first...'}
          disabled={loading}
          className="chatbot-input"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="chatbot-send-btn"
        >
          Send
        </button>
      </div>
    </div>
  );
}
