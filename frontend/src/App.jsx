import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE || 'http://localhost:3001')
  : window.location.origin;

const STORAGE_KEY = 'ditto_chat_history';

function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage quota exceeded — silently ignore
    }
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/status`);
      const data = await res.json();
      setIsConnected(data.connected);
    } catch (e) {
      console.error('Status check failed', e);
    }
  };

  const handleSend = async (text = input) => {
    if (!text.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages })
      });
      const data = await res.json();

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply, proposal: data.proposal, executionId: data.executionId }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not connect to backend.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecute = async (executionId, approved) => {
    setMessages(prev => [...prev, { role: 'assistant', content: approved ? 'Executing actions...' : 'Cancelling...' }]);
    try {
      const res = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId, approved })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error executing action.' }]);
    }
  };

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      handleSend(transcript);
    };
    recognition.start();
  };

  const formatProposal = (toolCalls) => {
    return toolCalls.map((tc, idx) => {
      const args = JSON.parse(tc.function.arguments);
      let summary = tc.function.name.replace('hubspot_', '').replace('_', ' ');
      summary = summary.charAt(0).toUpperCase() + summary.slice(1);

      const details = Object.entries(args)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ');

      return (
        <div key={idx} className="tool-proposal">
          <strong>{summary}</strong>
          <p>{details}</p>
        </div>
      );
    });
  };

  return (
    <div className="app-container">
      <header>
        <h1>HubSpot Assistant</h1>
        <div className="header-actions">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="btn-clear">Clear Chat</button>
          )}
          <button
            onClick={() => window.location.href = `${API_BASE}/auth/hubspot`}
            className={isConnected ? 'btn-connected' : 'btn-connect'}
          >
            {isConnected ? 'Connected' : 'Connect HubSpot'}
          </button>
        </div>
      </header>

      <div className="chat-window">
        {messages.length === 0 && (
          <div className="welcome">
            <h2>Welcome!</h2>
            <p>I can help you manage your HubSpot CRM. Try saying "Create a contact for Alice at alice@example.com".</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="bubble">
              <div className="text-content">{m.content}</div>
              {m.proposal && (
                <div className="proposal-ui">
                  <div className="proposal-list">
                    {formatProposal(m.proposal)}
                  </div>
                  <div className="actions">
                    <button onClick={() => handleExecute(m.executionId, true)}>Approve</button>
                    <button onClick={() => handleExecute(m.executionId, false)} className="btn-cancel">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="bubble typing-indicator">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="input-area">
        <button
          onClick={startVoice}
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          title="Voice Input"
        >
          {isRecording ? 'Listening...' : '🎤'}
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          disabled={isRecording || isLoading}
        />
        <button onClick={() => handleSend()} disabled={!input.trim() || isRecording || isLoading}>
          {isLoading ? 'Thinking...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default App;
