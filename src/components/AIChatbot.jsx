import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, Sparkles, User, Loader2, Key, Settings, BarChart3, XCircle, Trash2 } from 'lucide-react';
import ChatMarkdown from './ChatMarkdown';
import { useAuth } from '../auth/AuthContext';
import { authedFetch, describeChatError, ChatAuthError, shortLabel } from '../lib/chatApi';

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:5002';
const SESSION_KEY = 'ria_chat_session_id';

function getOrCreateSessionId() {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = crypto.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return `s-${Date.now()}`;
  }
}

const WELCOME_MSG = {
  id: 1,
  text: "Hello! I'm your KLE Research AI Assistant. I have live access to your dashboard data. What would you like to know?",
  isBot: true,
};

// Fallback quick actions, used only for the VC/Admin view when /api/personas is unavailable.
// Every other role gets its persona's own suggested questions from the backend.
const VC_FALLBACK_ACTIONS = [
  {
    label: 'Research overview',
    prompt: 'Give me a comprehensive overview of KLE Tech\'s research output: total publications, Q1/Q2 breakdown, top departments, and key h-index metrics.',
  },
  {
    label: 'Top departments',
    prompt: 'Which departments have the highest research output? Rank by total publications and also by Q1 publication count.',
  },
  {
    label: 'Q1 leaders',
    prompt: 'Who are the top faculty members and departments leading in Q1-ranked Scopus publications at KLE Tech?',
  },
  {
    label: 'H-Index trends',
    prompt: 'Show the h-index distribution across faculty. Who are the top 10 faculty by Scopus h-index, and what is the average per department?',
  },
  {
    label: 'Citation analysis',
    prompt: 'Analyse citation impact: which departments and faculty have the highest Scopus citations? Show top 10 by citation count.',
  },
];

export default function AIChatbot({ contextData, chartFocus, onChartFocusHandled }) {
  const { user } = useAuth() || {};
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const lastChartFocusRef = useRef(null);

  const [activeChartContext, setActiveChartContext] = useState(null);

  const [apiKey, setApiKey] = useState(localStorage.getItem('groq_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState(localStorage.getItem('groq_api_key') || '');

  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId());
  const [personaActions, setPersonaActions] = useState([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Quick actions come from the caller's own persona (server-resolved from the session).
  useEffect(() => {
    if (!isOpen || !user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const resp = await authedFetch(`${CHAT_API_URL}/api/personas`);
        if (!resp.ok) return;
        const data = await resp.json();
        const own = (data.personas || []).find(p => p.persona_id === data.own_persona_id);
        if (!cancelled && own) {
          setPersonaActions((own.suggested_questions || []).map(q => ({ label: shortLabel(q), prompt: q, title: q })));
        }
      } catch (err) {
        if (!(err instanceof ChatAuthError)) console.warn('[AIChatbot] could not load persona questions:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, user?.id]);

  // When a chart is clicked, open chatbot and set context
  useEffect(() => {
    if (!chartFocus || !chartFocus.ts) return;
    if (lastChartFocusRef.current === chartFocus.ts) return;
    lastChartFocusRef.current = chartFocus.ts;

    setActiveChartContext({
      id: chartFocus.id,
      title: chartFocus.title,
      contextSummary: chartFocus.contextSummary || '',
      prompt: chartFocus.prompt,
    });

    setIsOpen(true);

    setMessages(prev => [...prev, {
      id: Date.now(),
      text: `**Chart focused: ${chartFocus.title}**\nI'm now ready to answer questions about this chart. Ask me anything related to the **${chartFocus.title}** data!`,
      isBot: true,
      isContextMsg: true,
    }]);

    if (onChartFocusHandled) onChartFocusHandled();
  }, [chartFocus, onChartFocusHandled]);

  const saveApiKey = (e) => {
    e.preventDefault();
    setApiKey(tempKey);
    localStorage.setItem('groq_api_key', tempKey);
    setShowSettings(false);
  };

  const abortControllerRef = useRef(null);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsTyping(false);
  };

  const askBackend = useCallback(async (messageText, currentMessages) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Authorization: Bearer <access token> is added by authedFetch. Role, persona and
      // user context are derived server-side from that token, never from this body.
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-Groq-Key'] = apiKey;

      const history = (currentMessages || messages)
        .filter(m => !m.isContextMsg)
        .slice(-10)
        .map(m => ({ role: m.isBot ? 'assistant' : 'user', content: m.text }));

      const resp = await authedFetch(`${CHAT_API_URL}/chat`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          message: messageText,
          chart_title: activeChartContext?.title || null,
          session_id: sessionId,
          history,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return describeChatError(resp.status, data.detail || resp.statusText);
      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id);
        try { sessionStorage.setItem(SESSION_KEY, data.session_id); } catch {}
      }
      return data.reply || "I couldn't generate a response. Please try again.";
    } catch (err) {
      if (err.name === 'AbortError') {
        return "Query cancelled by user.";
      }
      if (err instanceof ChatAuthError) {
        return 'You are signed out. Please sign in again to use the assistant.';
      }
      return `Sorry, I couldn't reach the chat backend (${err.message}).`;
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [apiKey, activeChartContext, sessionId, messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = { id: Date.now(), text: input, isBot: false };
    const currentInput = input;
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setInput('');
    setIsTyping(true);

    const reply = await askBackend(currentInput, updatedMessages);
    setIsTyping(false);
    setMessages(prev => [...prev, { id: Date.now() + 1, text: reply, isBot: true }]);
  };

  const handleQuickAction = async (action) => {
    if (isTyping) return;

    // Display text is the label; actual prompt sent to AI is the full prompt
    const displayMsg = { id: Date.now(), text: action.label, isBot: false };
    const updatedMessages = [...messages, displayMsg];
    setMessages(updatedMessages);
    setIsTyping(true);

    const reply = await askBackend(action.prompt, updatedMessages);
    setIsTyping(false);
    setMessages(prev => [...prev, { id: Date.now() + 1, text: reply, isBot: true }]);
  };

  const handleClear = () => {
    // Generate a new session ID so the backend creates fresh SessionContext
    const newId = crypto.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { sessionStorage.setItem(SESSION_KEY, newId); } catch {}
    setSessionId(newId);
    setMessages([{
      ...WELCOME_MSG,
      id: Date.now(),
      text: 'Context cleared. Ask me anything about KLE Tech\'s research data!',
    }]);
    setActiveChartContext(null);
    setInput('');
  };

  const chartQuickActions = activeChartContext
    ? [
        { label: `What does "${activeChartContext.title}" show?`, prompt: activeChartContext.prompt || `Explain the ${activeChartContext.title} chart.` },
        { label: `Key insights`, prompt: `What are the key insights and anomalies from the ${activeChartContext.title} data?` },
      ]
    : null;

  const roleActions = personaActions.length
    ? personaActions
    : (user?.role === 'university-dean' ? VC_FALLBACK_ACTIONS : []);
  const visibleActions = chartQuickActions || roleActions;

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-8 right-8 w-14 h-14 bg-kle-crimson text-white rounded-full shadow-lg flex items-center justify-center cursor-pointer z-50 hover:bg-kle-dark transition-colors"
          >
            <MessageSquare size={24} />
            <span className="absolute top-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-8 right-8 w-full max-w-[420px] h-[620px] max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-mist overflow-hidden"
          >
            {/* Header */}
            <div className="bg-kle-crimson p-md flex items-center justify-between text-white shadow-md z-10">
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-inner">
                  <Bot size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-base text-white">KLE Research AI</h3>
                  <p className="text-micro text-white flex items-center gap-1.5 opacity-90">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Available
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-xs">
                <button
                  onClick={handleClear}
                  disabled={isTyping}
                  className="text-white/80 hover:text-white transition-colors p-xs hover:bg-white/10 rounded-lg disabled:opacity-40"
                  title="Clear conversation context"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-white/80 hover:text-white transition-colors p-xs hover:bg-white/10 rounded-lg"
                  title="API key settings"
                >
                  <Settings size={18} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/80 hover:text-white transition-colors p-xs hover:bg-white/10 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Settings Cover */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute inset-x-0 top-[72px] bg-white border-b border-mist p-md shadow-lg z-20"
                >
                  <h4 className="font-heading font-medium text-kle-dark flex items-center gap-2 mb-sm text-sm">
                    <Key size={16} /> API Key Override
                  </h4>
                  <p className="text-xs text-smoke mb-md">
                    Optional: supply your own Groq key (gsk_...) to override the server default. Leave empty to use the server key.
                  </p>
                  <form onSubmit={saveApiKey} className="flex gap-2">
                    <input
                      type="password"
                      placeholder="gsk_..."
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      className="flex-1 border border-mist rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-kle-crimson"
                    />
                    <button type="submit" className="bg-kle-crimson text-white px-3 py-1.5 rounded-md text-sm hover:bg-kle-dark transition-colors">
                      Save
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-md space-y-lg bg-fog relative">
              {/* Active Chart Context Banner */}
              <AnimatePresence>
                {activeChartContext && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-gradient-to-r from-kle-crimson/10 to-accent-indigo/10 border border-kle-crimson/20 rounded-xl p-3 flex items-center gap-2.5"
                  >
                    <div className="w-8 h-8 rounded-lg bg-kle-crimson/15 flex items-center justify-center flex-shrink-0">
                      <BarChart3 size={16} className="text-kle-crimson" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-kle-dark truncate">Focused: {activeChartContext.title}</p>
                      <p className="text-[10px] text-smoke">Queries scoped to this chart only</p>
                    </div>
                    <button
                      onClick={() => setActiveChartContext(null)}
                      className="flex-shrink-0 p-1 text-smoke hover:text-kle-crimson transition-colors rounded-md hover:bg-kle-crimson/10"
                      title="Clear chart focus"
                    >
                      <XCircle size={16} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-sm max-w-[85%] ${msg.isBot ? '' : 'ml-auto flex-row-reverse'}`}
                >
                  <div className={`w-8 h-8 mt-1 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm ${msg.isBot ? 'bg-white border border-mist text-kle-crimson' : 'bg-kle-crimson/10 text-kle-crimson'}`}>
                    {msg.isBot ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div className={`p-md rounded-2xl text-sm leading-relaxed ${msg.isBot
                    ? 'bg-white border border-mist text-graphite rounded-tl-sm shadow-sm'
                    : 'bg-gradient-to-br from-kle-crimson to-kle-dark text-white rounded-tr-sm shadow-md'}`}
                  >
                    {msg.isBot ? (
                      <ChatMarkdown text={msg.text} />
                    ) : msg.text}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-sm max-w-[85%]">
                  <div className="w-8 h-8 mt-1 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm bg-white border border-mist text-kle-crimson">
                    <Bot size={16} />
                  </div>
                  <div className="p-sm rounded-2xl bg-white border border-mist rounded-tl-sm shadow-sm flex items-center gap-1 text-graphite h-10">
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-smoke rounded-full" />
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-smoke rounded-full" />
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-smoke rounded-full" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions — always visible, horizontally scrollable */}
            {visibleActions.length > 0 && (
            <div className="px-md py-2 bg-white border-t border-mist flex gap-xs overflow-x-auto scrollbar-hide">
              {visibleActions.map((action, idx) => (
                <button
                  key={idx}
                  title={action.title || action.label}
                  onClick={() => handleQuickAction(action)}
                  disabled={isTyping}
                  className="flex-shrink-0 text-micro bg-fog border border-mist px-sm py-1.5 rounded-full text-graphite hover:border-kle-crimson hover:text-kle-crimson hover:bg-kle-crimson/5 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles size={10} className="text-accent-indigo flex-shrink-0" />
                  {action.label}
                </button>
              ))}
            </div>
            )}

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-md bg-white flex gap-sm items-center shadow-[0_-4px_20px_-15px_rgba(0,0,0,0.1)] z-10 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isTyping}
                placeholder={isTyping ? 'Waiting for AI…' : 'Ask your data anything…'}
                className="flex-1 bg-fog border border-mist rounded-xl px-md py-3 text-sm focus:outline-none focus:border-kle-crimson focus:ring-2 focus:ring-kle-crimson/20 transition-all font-body text-kle-dark placeholder:text-smoke disabled:opacity-60"
              />
              <button
                type={isTyping ? "button" : "submit"}
                onClick={isTyping ? handleCancel : undefined}
                disabled={!isTyping && !input.trim()}
                className="w-12 h-12 flex-shrink-0 bg-kle-crimson text-white rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-kle-dark transition-colors shadow-md active:scale-95"
                title={isTyping ? "Stop generating" : "Send query"}
              >
                {isTyping ? <X size={20} /> : <Send size={18} className="ml-1" />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
