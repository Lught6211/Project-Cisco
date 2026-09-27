'use client';

import React, { useState, useEffect, useRef } from 'react';
import MemoryScene from './MemoryScene';
import './scene.css';

type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function Page() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });

  // Distinct Cyberpunk/Sci-Fi Color Palette for each unique state
  const getStatusColor = (currentStatus: AgentStatus) => {
    switch (currentStatus) {
      case 'idle':
        return '#4a5568';     // Muted Slate Grey / Dim Teal
      case 'listening':
        return '#00f0ff';     // Electric Cyan / Bright Blue
      case 'thinking':
        return '#ffb700';     // Warning Amber / Gold
      case 'speaking':
        return '#00ff66';     // Neon Emerald Green
      default:
        return '#4a5568';
    }
  };

  const handleSendMessage = async (promptText?: string) => {
    const textToSend = promptText || inputVal;
    if (!textToSend.trim()) return;

    const newMessages = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setInputVal('');

    // 1. Set state to Thinking (Triggers Amber/Gold color)
    setStatus('thinking');

    try {
      // Connect to FastAPI backend endpoint
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToSend }),
      });

      if (!response.ok) throw new Error('Network response failed');

      const data = await response.json();
      
      // 2. Set state to Speaking (Triggers Neon Green color)
      setStatus('speaking');
      setMessages([...newMessages, { role: 'assistant', content: data.reply || "Systems nominal. Response received." }]);

      // Reset back to idle after response simulation
      setTimeout(() => setStatus('idle'), 4000);

    } catch (err) {
      console.error('Agent connection error:', err);
      setStatus('idle');
      setMessages([...newMessages, { role: 'assistant', content: 'Error: Connection timeout or backend offline.' }]);
    }
  };

  return (
    <main className="w-screen h-screen relative bg-[#060b10] text-white overflow-hidden font-mono">
      {/* Top Navigation HUD */}
      <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-20 pointer-events-none">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor(status), boxShadow: `0 0 12px ${getStatusColor(status)}` }} />
          <h1 className="text-lg font-bold tracking-widest uppercase">CiscoAI</h1>
          <span className="text-xs text-slate-500">/ autonomous intelligence / 01</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>CORE ONLINE</span>
          <span id="utc-time">09:41:22 UTC</span>
        </div>
      </header>

      {/* 3D Interactive Memory Graph Scene */}
      <div className="absolute inset-0 z-0">
        <MemoryScene data={graphData} status={status} />
      </div>

      {/* Control Sidebar HUD */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-20">
        <button 
          onClick={() => setStatus(status === 'listening' ? 'idle' : 'listening')}
          className="p-4 rounded-full bg-slate-900/80 border border-slate-700 hover:border-cyan-400 transition-all shadow-lg backdrop-blur-md"
          style={{ borderColor: status === 'listening' ? '#00f0ff' : undefined }}
          title="Toggle Mic / Listening"
        >
          🎤
        </button>
      </div>

      {/* Status Footer Indicator */}
      <footer className="absolute bottom-6 left-6 z-20 flex items-center gap-3 text-xs tracking-wider">
        <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: getStatusColor(status) }} />
        <span className="uppercase font-semibold" style={{ color: getStatusColor(status) }}>
          {status}
        </span>
      </footer>
    </main>
  );
}