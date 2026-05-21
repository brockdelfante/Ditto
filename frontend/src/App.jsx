import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    checkStatus();
  }, []);

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
    if (!text.trim()) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages })
      });
      const data = await res.json();

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply, proposal: data.proposal, executionId: data.executionId }]);
        if (data.proposal) {
          setPendingAction({ executionId: data.executionId, proposal: data.proposal });
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not connect to backend.' }]);
    }
  };

  const handleExecute = async (executionId, approved) => {
    setPendingAction(null);
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

  return (
    <div className="app-container">
      <header>
        <h1>HubSpot Assistant</h1>
        <button
          onClick={() => window.location.href = `${API_BASE}/auth/hubspot`}
          className={isConnected ? 'btn-connected' : 'btn-connect'}
        >
          {isConnected ? 'HubSpot Connected' : 'Connect HubSpot'}
        </button>
      </header>

      <div className="chat-window">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="bubble">
              {m.content}
              {m.proposal && (
                <div className="proposal-ui">
                  <p><strong>Proposed Actions:</strong></p>
                  <pre>{JSON.stringify(m.proposal, null, 2)}</pre>
                  <div className="actions">
                    <button onClick={() => handleExecute(m.executionId, true)}>Approve</button>
                    <button onClick={() => handleExecute(m.executionId, false)} className="btn-cancel">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="input-area">
        <button
          onClick={startVoice}
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
        >
          🎤
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button onClick={() => handleSend()}>Send</button>
      </div>
    </div>
  );
}

export default App;
