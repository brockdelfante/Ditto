import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE || 'http://localhost:3001')
  : window.location.origin;

const STORAGE_KEY = 'ditto_chat_history';
const REJECTION_KEYWORDS = ['no', 'cancel', 'stop', "don't", 'nope', 'nevermind', 'never mind', 'abort', 'skip', 'forget it'];

// ── Formatters ────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

function fmtCur(n) {
  if (n === null || n === undefined || n === 0) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n}`;
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

// ── Trend badge ───────────────────────────────────────────────────────────

function Trend({ change, inverse = false, isPoints = false }) {
  if (change === null || change === undefined) return null;
  const good = inverse ? change < 0 : change > 0;
  const cls = good ? 'trend-up' : change === 0 ? 'trend-flat' : 'trend-down';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '—';
  const label = change === 0 ? '0%' : `${Math.abs(change)}${isPoints ? 'pp' : '%'}`;
  return <span className={`trend ${cls}`}>{arrow} {label}</span>;
}

// ── Metric row ────────────────────────────────────────────────────────────

function MetricRow({ label, value, change, inverse, isPoints, sub }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <div className="metric-right">
        <span className="metric-value">{value}</span>
        <Trend change={change} inverse={inverse} isPoints={isPoints} />
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dash-section">
      <button className="dash-section-header" onClick={() => setOpen(o => !o)}>
        <span>{icon} {title}</span>
        <span className="dash-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="dash-section-body">{children}</div>}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────

function Dashboard({ isConnected }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (force = false) => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const url = force ? `${API_BASE}/api/dashboard?refresh=1` : `${API_BASE}/api/dashboard`;
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!isConnected) {
    return (
      <aside className="dashboard-panel">
        <div className="dash-topbar"><span>Dashboard</span></div>
        <div className="dash-not-connected">Connect HubSpot to see your CRM metrics here.</div>
      </aside>
    );
  }

  const d = data;
  const deals = d?.deals;
  const activity = d?.activity;
  const contacts = d?.contacts;

  // Stage breakdown — top 5
  const stages = deals?.byStage
    ? Object.entries(deals.byStage).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : [];

  // Source breakdown — top 4
  const sources = contacts?.sources
    ? Object.entries(contacts.sources).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : [];

  return (
    <aside className="dashboard-panel">
      <div className="dash-topbar">
        <span>Dashboard <span className="dash-period">· last 30d vs prior</span></span>
        <button className="dash-refresh-btn" onClick={() => fetchData(true)} disabled={loading} title="Refresh">
          <span className={loading ? 'spinning' : ''}>↻</span>
        </button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {!d && loading && (
        <div className="dash-skeleton">
          {[...Array(12)].map((_, i) => <div key={i} className="skel-row" />)}
        </div>
      )}

      {d && (
        <>
          {/* Sales */}
          <Section title="Sales" icon="💼" defaultOpen={true}>
            <MetricRow label="New Deals" value={fmtNum(deals?.created?.current)} change={deals?.created?.change} />
            <MetricRow label="Pipeline Added" value={fmtCur(deals?.pipeline?.current)} change={deals?.pipeline?.change} />
            <MetricRow label="Closed Won" value={`${fmtNum(deals?.won?.count?.current)} · ${fmtCur(deals?.won?.value?.current)}`} change={deals?.won?.count?.change} />
            <MetricRow label="Closed Lost" value={fmtNum(deals?.lost?.current)} change={deals?.lost?.change} inverse />
            <MetricRow label="Win Rate" value={fmtPct(deals?.winRate?.current)} change={deals?.winRate?.change} isPoints />
            <MetricRow label="Avg Deal Size" value={fmtCur(deals?.avgSize?.current)} change={deals?.avgSize?.change} />
            {deals?.overdueCount > 0 && (
              <MetricRow label="Past Close Date" value={fmtNum(deals?.overdueCount)} change={null} inverse />
            )}
          </Section>

          {/* Pipeline snapshot */}
          {stages.length > 0 && (
            <Section title="Pipeline by Stage" icon="📊" defaultOpen={false}>
              {stages.map(([stage, count]) => (
                <div key={stage} className="metric-row">
                  <span className="metric-label">{stage.replace(/_/g, ' ')}</span>
                  <span className="metric-value">{count}</span>
                </div>
              ))}
            </Section>
          )}

          {/* Contacts */}
          <Section title="Contacts" icon="👥" defaultOpen={true}>
            <MetricRow label="New Contacts" value={fmtNum(contacts?.current)} change={contacts?.change} />
            {activity?.overdueTasks > 0 && (
              <MetricRow label="Overdue Tasks" value={fmtNum(activity?.overdueTasks)} change={null} inverse />
            )}
            {sources.length > 0 && (
              <div className="metric-breakdown">
                <div className="metric-breakdown-title">Source breakdown</div>
                {sources.map(([src, count]) => (
                  <div key={src} className="breakdown-row">
                    <span>{src}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Activity */}
          <Section title="Activity" icon="📞" defaultOpen={true}>
            {activity?.calls && (
              <MetricRow label="Calls" value={fmtNum(activity.calls.current)} change={activity.calls.change} />
            )}
            {activity?.meetings && (
              <MetricRow label="Meetings" value={fmtNum(activity.meetings.current)} change={activity.meetings.change} />
            )}
            <MetricRow label="Tasks" value={fmtNum(activity?.tasks?.current)} change={activity?.tasks?.change} />
            {activity?.overdueTasks > 0 && (
              <MetricRow label="Overdue Tasks" value={fmtNum(activity?.overdueTasks)} change={null} inverse />
            )}
          </Section>

          {/* Marketing / Campaigns */}
          {d.campaigns && (
            <Section title="Campaigns" icon="📧" defaultOpen={false}>
              <div className="metric-row"><span className="metric-label metric-dim">Campaign data loaded</span></div>
            </Section>
          )}
        </>
      )}

      {d && (
        <div className="dash-footer">Updated {timeAgo(d.fetchedAt)} · auto-refreshes every 30m</div>
      )}
    </aside>
  );
}

// ── App ───────────────────────────────────────────────────────────────────

function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPendingAction, setHasPendingAction] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { checkStatus(); }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); }
    catch { /* quota exceeded */ }
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/status`);
      const data = await res.json();
      setIsConnected(data.connected);
    } catch (e) { console.error('Status check failed', e); }
  };

  const handleSend = async (text = input) => {
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    inputRef.current?.focus();

    try {
      if (hasPendingAction) {
        const isRejection = REJECTION_KEYWORDS.some(kw => text.toLowerCase().includes(kw));
        setHasPendingAction(false);

        const res = await fetch(`${API_BASE}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: !isRejection, message: text, history: messages })
        });
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error }]);
        return;
      }

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages })
      });
      const data = await res.json();

      if (data.pendingAction) setHasPendingAction(true);

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't connect to the server." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser.'); return; }
    if (isRecording) return;

    const r = new SR();
    r.lang = 'en-US';
    r.onstart = () => setIsRecording(true);
    r.onend = () => setIsRecording(false);
    r.onerror = () => setIsRecording(false);
    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      handleSend(t);
    };
    r.start();
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">H</div>
          <span className="header-title">HubSpot Assistant</span>
        </div>
        <div className="header-actions">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setHasPendingAction(false); }} className="btn-ghost">
              Clear chat
            </button>
          )}
          <button
            onClick={() => window.location.href = `${API_BASE}/auth/hubspot`}
            className={isConnected ? 'btn-connected' : 'btn-connect'}
          >
            <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
            {isConnected ? 'Connected' : 'Connect HubSpot'}
          </button>
        </div>
      </header>

      <div className="app-body">
        <section className="chat-section">
          <div className="chat-window">
            {messages.length === 0 && (
              <div className="welcome">
                <div className="welcome-icon">💬</div>
                <h2>How can I help?</h2>
                <p>Ask me anything about your HubSpot CRM — contacts, deals, companies, and campaigns.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role}`}>
                {m.role === 'assistant' && <div className="msg-avatar">H</div>}
                <div className="bubble">{m.content}</div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <div className="msg-avatar">H</div>
                <div className="bubble typing-indicator"><span /><span /><span /></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="input-area">
            <button
              onClick={startVoice}
              className={`voice-btn ${isRecording ? 'recording' : ''}`}
              title={isRecording ? 'Listening...' : 'Talk'}
              disabled={isLoading}
            >
              {isRecording ? '⏹' : '🎤'}
              <span>{isRecording ? 'Listening' : 'Talk'}</span>
            </button>
            <div className="input-wrap">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={hasPendingAction ? 'Reply yes or no...' : 'Ask me anything...'}
                disabled={isRecording || isLoading}
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={!input.trim() || isRecording || isLoading}
              >
                {isLoading ? '…' : '↑'}
              </button>
            </div>
          </div>
        </section>

        <Dashboard isConnected={isConnected} />
      </div>
    </div>
  );
}

export default App;
