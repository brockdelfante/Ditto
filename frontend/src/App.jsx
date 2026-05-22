import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE || 'http://localhost:3001')
  : window.location.origin;

const STORAGE_KEY = 'ditto_chat_history';
const REJECTION_KEYWORDS = ['no', 'cancel', 'stop', "don't", 'nope', 'nevermind', 'never mind', 'abort', 'skip', 'forget it'];

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function DashboardCard({ title, items, renderItem, emptyMsg, loading }) {
  return (
    <div className="dash-card">
      <div className="dash-card-title">{title}</div>
      {loading ? (
        <div className="dash-loading"><span /><span /><span /></div>
      ) : !items || items.length === 0 ? (
        <div className="dash-empty">{emptyMsg || 'No data'}</div>
      ) : (
        <ul className="dash-list">
          {items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}
        </ul>
      )}
    </div>
  );
}

function Dashboard({ isConnected }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Dashboard fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    fetchData();
    // Refresh every 12 hours
    const interval = setInterval(fetchData, 12 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const extractContacts = (raw) => {
    try {
      const results = raw?.content?.[0]?.text ? JSON.parse(raw.content[0].text) : raw;
      return results?.results || results?.contacts || (Array.isArray(results) ? results : []);
    } catch { return []; }
  };

  const extractDeals = (raw) => {
    try {
      const results = raw?.content?.[0]?.text ? JSON.parse(raw.content[0].text) : raw;
      return results?.results || results?.deals || (Array.isArray(results) ? results : []);
    } catch { return []; }
  };

  const extractCompanies = (raw) => {
    try {
      const results = raw?.content?.[0]?.text ? JSON.parse(raw.content[0].text) : raw;
      return results?.results || results?.companies || (Array.isArray(results) ? results : []);
    } catch { return []; }
  };

  if (!isConnected) {
    return (
      <aside className="dashboard-panel">
        <div className="dash-header">Dashboard</div>
        <div className="dash-not-connected">Connect HubSpot to see your CRM data here.</div>
      </aside>
    );
  }

  const contacts = extractContacts(data?.contacts);
  const deals = extractDeals(data?.deals);
  const companies = extractCompanies(data?.companies);

  return (
    <aside className="dashboard-panel">
      <div className="dash-header">
        <span>Dashboard</span>
        <button className="dash-refresh" onClick={fetchData} title="Refresh" disabled={loading}>↻</button>
      </div>

      <DashboardCard
        title="Recent Contacts"
        items={contacts}
        loading={loading && !data}
        emptyMsg="No contacts found"
        renderItem={c => {
          const p = c.properties || c;
          const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || 'Unknown';
          return (
            <div className="dash-item">
              <div className="dash-avatar">{name[0]?.toUpperCase()}</div>
              <div>
                <div className="dash-item-name">{name}</div>
                <div className="dash-item-sub">{p.email || '—'}</div>
              </div>
            </div>
          );
        }}
      />

      <DashboardCard
        title="Recent Deals"
        items={deals}
        loading={loading && !data}
        emptyMsg="No deals found"
        renderItem={d => {
          const p = d.properties || d;
          const amount = p.amount ? `$${Number(p.amount).toLocaleString()}` : '—';
          return (
            <div className="dash-item">
              <div className="dash-avatar deal">$</div>
              <div>
                <div className="dash-item-name">{p.dealname || 'Unnamed deal'}</div>
                <div className="dash-item-sub">{amount} · {p.dealstage || '—'}</div>
              </div>
            </div>
          );
        }}
      />

      <DashboardCard
        title="Companies"
        items={companies}
        loading={loading && !data}
        emptyMsg="No companies found"
        renderItem={c => {
          const p = c.properties || c;
          return (
            <div className="dash-item">
              <div className="dash-avatar company">🏢</div>
              <div>
                <div className="dash-item-name">{p.name || 'Unknown'}</div>
                <div className="dash-item-sub">{p.domain || p.industry || '—'}</div>
              </div>
            </div>
          );
        }}
      />

      {data?.fetchedAt && (
        <div className="dash-footer">Updated {timeAgo(data.fetchedAt)} · refreshes every 12h</div>
      )}
    </aside>
  );
}

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
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t connect to the server.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech recognition is not supported in this browser.'); return; }
    if (isRecording) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      handleSend(transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.start();
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
