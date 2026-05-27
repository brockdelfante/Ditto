import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE || 'http://localhost:3001')
  : window.location.origin;

const STORAGE_KEY = 'ditto_chat_history';
const REJECTION_KEYWORDS = ['no', 'cancel', 'stop', "don't", 'nope', 'nevermind', 'never mind', 'abort', 'skip', 'forget it'];

const QUICK_ACTIONS = [
  { label: 'Manage contact or deal', message: 'I want to manage an existing contact, company or deal.' },
  { label: 'Add new contact', message: 'I want to add a new contact.' },
  { label: 'Log sales activity', message: 'I want to log sales activity.' },
  { label: 'Background research on a Contact', message: 'Bring me up to speed on a contact.' },
];

function InfoPanel({ items }) {
  return (
    <aside className="info-panel" style={{ display: 'flex' }}>
      <div className="info-panel-header">
        <span>Agent Activity</span>
      </div>
      <div className="info-panel-body">
        {!items.length ? (
          <div className="info-panel-empty">Agent activity and research will appear here.</div>
        ) : (
          items.map((item, i) => (
            <div key={i} className={`info-panel-item info-panel-item--${item.type}`}>
              {i > 0 && <div className="info-panel-divider" />}
              {item.type === 'research' ? (
                <div className="info-panel-research" dangerouslySetInnerHTML={{ __html: item.content }} />
              ) : (
                <div className="info-panel-summary">
                  {item.content.split('------').map((section, si) => (
                    <React.Fragment key={si}>
                      {si > 0 && <div className="info-panel-divider" />}
                      <p className="info-panel-summary-text">{section.trim()}</p>
                    </React.Fragment>
                  ))}
                  <span className="info-panel-timestamp">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export default function ChatView() {
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
  const [pendingExecutionId, setPendingExecutionId] = useState(null);
  const [panelItems, setPanelItems] = useState([]);
  const [liveMode, setLiveMode] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const liveModeRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const prevIsLoadingRef = useRef(false);
  const startVoiceFnRef = useRef(null);
  const isSpeakingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { liveModeRef.current = liveMode; }, [liveMode]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  // Auto-restart mic when agent finishes responding in live mode (fallback when no TTS)
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;
    if (wasLoading && !isLoading && liveModeRef.current && !isSpeakingRef.current) {
      const timer = setTimeout(() => {
        if (liveModeRef.current && !isLoadingRef.current && !isRecordingRef.current && !isSpeakingRef.current) {
          startVoiceFnRef.current?.();
        }
      }, 700);
      return () => clearTimeout(timer);
    }
  });

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

  const handleConnect = () => {
    const popup = window.open(
      `${API_BASE}/auth/hubspot`,
      'hubspot-auth',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      // Popup was blocked — fall back to same-window navigation
      window.location.href = `${API_BASE}/auth/hubspot`;
      return;
    }

    const onMessage = (event) => {
      if (event.data === 'hubspot-auth-success') {
        setIsConnected(true);
        window.removeEventListener('message', onMessage);
      }
    };
    window.addEventListener('message', onMessage);
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
        const execId = pendingExecutionId;
        setHasPendingAction(false);
        setPendingExecutionId(null);

        const res = await fetch(`${API_BASE}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: !isRejection, message: text, history: messages, executionId: execId }),
        });
        const data = await res.json();
        if (data.panelUpdates?.length) {
          setPanelItems(prev => [...data.panelUpdates.reverse(), ...prev]);
        }
        const reply = data.reply || data.error;
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        if (liveModeRef.current && data.reply) speak(data.reply);
        return;
      }

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages }),
      });
      const data = await res.json();
      if (data.panelUpdates?.length) {
        setPanelItems(prev => [...data.panelUpdates.reverse(), ...prev]);
      }

      if (data.pendingAction) {
        setHasPendingAction(true);
        setPendingExecutionId(data.executionId || null);
      }

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        if (liveModeRef.current) speak(data.reply);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't connect to the server." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const speak = (text) => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const onDone = () => {
      isSpeakingRef.current = false;
      if (liveModeRef.current && !isLoadingRef.current && !isRecordingRef.current) {
        startVoiceFnRef.current?.();
      }
    };
    utterance.onstart = () => { isSpeakingRef.current = true; };
    utterance.onend = onDone;
    utterance.onerror = onDone;
    window.speechSynthesis.speak(utterance);
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser.'); return; }
    if (isRecordingRef.current) return;
    window.speechSynthesis?.cancel();
    isSpeakingRef.current = false;

    const r = new SR();
    r.lang = 'en-US';
    r.onstart = () => { setIsRecording(true); isRecordingRef.current = true; };
    r.onend = () => { setIsRecording(false); isRecordingRef.current = false; };
    r.onerror = () => { setIsRecording(false); isRecordingRef.current = false; };
    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      handleSend(t);
    };
    r.start();
  };

  // Store latest startVoice in ref so the auto-restart effect can call it
  startVoiceFnRef.current = startVoice;

  const toggleLiveMode = () => {
    const next = !liveMode;
    setLiveMode(next);
    liveModeRef.current = next;
    if (!next) {
      window.speechSynthesis?.cancel();
      isSpeakingRef.current = false;
    } else {
      startVoice();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">H</div>
          <span className="header-title">HubSpot Assistant</span>
        </div>
        <div className="header-actions">
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setHasPendingAction(false); setPendingExecutionId(null); }}
              className="btn-ghost"
            >
              Clear chat
            </button>
          )}
          <button
            onClick={handleConnect}
            className={isConnected ? 'btn-connected' : 'btn-connect'}
          >
            <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
            {isConnected ? 'Connected' : 'Connect HubSpot'}
          </button>
        </div>
      </header>

      <div className="app-body">
        <InfoPanel items={panelItems} />

        <section className="chat-section" style={{ display: 'flex' }}>
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

          <div className="quick-actions-bar">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                className="quick-action-btn"
                onClick={() => handleSend(action.message)}
                disabled={isLoading || isRecording || liveMode}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="input-area">
            <div className="voice-controls">
              <button
                onClick={startVoice}
                className={`voice-btn ${isRecording && !liveMode ? 'recording' : ''}`}
                title={isRecording ? 'Listening...' : 'Talk (one message)'}
                disabled={isLoading || liveMode}
              >
                {isRecording && !liveMode ? '⏹' : '🎤'}
                <span>{isRecording && !liveMode ? 'Listening' : 'Talk'}</span>
              </button>
              <button
                onClick={toggleLiveMode}
                className={`live-btn ${liveMode ? 'live-active' : ''}`}
                title={liveMode ? 'Stop live mode' : 'Start live conversation'}
                disabled={isLoading && !liveMode}
              >
                {liveMode && isRecording ? '🔴' : '🎙'}
                <span>{liveMode ? (isRecording ? 'Listening' : 'Live') : 'Live'}</span>
              </button>
            </div>
            <div className="input-wrap">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={hasPendingAction ? 'Reply yes or no...' : 'Ask me anything...'}
                disabled={isRecording || isLoading || liveMode}
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={!input.trim() || isRecording || isLoading || liveMode}
              >
                {isLoading ? '…' : '↑'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
