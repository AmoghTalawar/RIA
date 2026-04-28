import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, Sparkles, User, Loader2, Key, Settings, BarChart3, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:8000';

export default function AIChatbot({ contextData, chartFocus, onChartFocusHandled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const lastChartFocusRef = useRef(null);

  /* ── Active chart context (scoped mode) ── */
  const [activeChartContext, setActiveChartContext] = useState(null);

  const [apiKey, setApiKey] = useState(localStorage.getItem('groq_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState(localStorage.getItem('groq_api_key') || '');

  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your KLE Research AI Assistant. I have live access to your dashboard data. What would you like to know?",
      isBot: true
    }
  ]);

  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, showSettings]);

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

    const contextMsg = {
      id: Date.now(),
      text: `**Chart focused: ${chartFocus.title}**\nI'm now ready to answer questions about this chart. Ask me anything related to the **${chartFocus.title}** data!`,
      isBot: true,
      isContextMsg: true,
    };
    setMessages(prev => [...prev, contextMsg]);

    if (onChartFocusHandled) onChartFocusHandled();
  }, [chartFocus, onChartFocusHandled]);

  const saveApiKey = (e) => {
    e.preventDefault();
    setApiKey(tempKey);
    localStorage.setItem('groq_api_key', tempKey);
    setShowSettings(false);
  };

  // The Groq tool loop, schema metadata, intent routing, and prompt context
  // now live in the Python backend (backend/). This component only POSTs to /chat.

  const askBackend = async (messageText) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      // Optional per-user override for the server's GROQ_API_KEY env var.
      if (apiKey) headers['X-Groq-Key'] = apiKey;

      // Build conversation history from messages state (last 10 messages)
      const history = messages
        .filter(m => !m.isContextMsg)
        .slice(-10)
        .map(m => ({
          role: m.isBot ? 'assistant' : 'user',
          content: m.text,
        }));

      const resp = await fetch(`${CHAT_API_URL}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: messageText,
          chart_title: activeChartContext?.title || null,
          session_id: sessionId,
          history,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return `Sorry, I ran into an error: ${data.detail || resp.statusText}`;
      }
      // Track session_id from backend for context continuity
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
      }
      return data.reply || "I couldn't generate a response. Please try again.";
    } catch (err) {
      console.error('[chat backend] error:', err);
      return `Sorry, I couldn't reach the chat backend (${err.message}).`;
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = { id: Date.now(), text: input, isBot: false };
    const currentInput = input;

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const reply = await askBackend(currentInput);

    setIsTyping(false);
    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      text: reply,
      isBot: true
    }]);
  };

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
            <span className="absolute top-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-white"></span>
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
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-8 right-8 w-full max-w-[420px] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-mist overflow-hidden"
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
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span> Available
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-xs">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-white/80 hover:text-white transition-colors p-xs hover:bg-white/10 rounded-lg"
                  title="Settings"
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
                    <Key size={16} /> API Key Configuration
                  </h4>
                  <p className="text-xs text-smoke mb-md">
                    Optional: supply your own Groq API key (starts with gsk_...) to override the server's key for this browser. Leave empty to use the default.
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
            <div className="flex-1 overflow-y-auto p-md space-y-lg bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fog relative">
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
                    : 'bg-gradient-to-br from-kle-crimson to-kle-dark text-white rounded-tr-sm shadow-md'
                    }`}>
                    {msg.isBot ? (
                      <div className="prose prose-sm prose-slate max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.text
                    )}
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

            {/* Suggested prompts */}
            <AnimatePresence>
              {messages.length < 3 && !isTyping && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-md pb-sm bg-fog flex flex-wrap gap-xs pt-2 border-t border-mist/50"
                >
                  {(activeChartContext
                    ? [`What does the ${activeChartContext.title} show?`, `Key insights from ${activeChartContext.title}?`, activeChartContext.prompt?.slice(0, 40) + '...']
                    : ["Publications in 2025?", "Summarize H-Index trends", "Who has highest citations?"]
                  ).map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(prompt.replace(/\.\.\.$/,''))}
                      className="text-micro bg-white border border-mist px-sm py-1.5 rounded-full text-graphite hover:border-kle-crimson hover:text-kle-crimson transition-colors flex items-center shadow-sm"
                    >
                      <Sparkles size={12} className="mr-1 text-accent-indigo" />
                      {prompt}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-md bg-white flex gap-sm items-center shadow-[0_-4px_20px_-15px_rgba(0,0,0,0.1)] z-10 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your data anything..."
                className="flex-1 bg-fog border border-mist rounded-xl px-md py-3 text-sm focus:outline-none focus:border-kle-crimson focus:ring-2 focus:ring-kle-crimson/20 transition-all font-body text-kle-dark placeholder:text-smoke disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="w-12 h-12 flex-shrink-0 bg-kle-crimson text-white rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-kle-dark transition-colors shadow-md active:scale-95"
              >
                {isTyping ? <Loader2 size={20} className="animate-spin" /> : <Send size={18} className="ml-1" />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
