import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE || 'http://localhost:3001')
  : window.location.origin;

const STORAGE_KEY = 'ditto_chat_history';

const REJECTION_KEYWORDS = ['no', 'cancel', 'stop', "don't", 'nope', 'nevermind', 'never mind', 'abort', 'skip', 'forget it'];

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
  const [hasPendingAction, setHasPendingAction] = useState(false);
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
      // If there's a pending action waiting for confirmation, treat this as the user's response
      if (hasPendingAction) {
        const lowerText = text.toLowerCase();
        const isRejection = REJECTION_KEYWORDS.some(kw => lowerText.includes(kw));
        setHasPendingAction(false);

        const res = await fetch(`${API_BASE}/api/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approved: !isRejection,
            message: text,
            history: messages
          })
        });
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error }]);
        return;
      }

      // Normal chat — LLM responds conversationally, no tools called
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages })
      });
      const data = await res.json();

      if (data.pendingAction) {
        setHasPendingAction(true);
      }

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not connect to backend.' }]);
    } finally {
      setIsLoading(false);
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

  return (
    <div className="app-container">
      <header>
        <h1>HubSpot Assistant</h1>
        <div className="header-actions">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setHasPendingAction(false); }} className="btn-clear">Clear Chat</button>
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
            <div className="bubble">{m.content}</div>
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
