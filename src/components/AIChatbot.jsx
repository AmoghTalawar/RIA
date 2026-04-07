import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, Sparkles, User, Loader2, Key, Settings, BarChart3, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Pre-processed context from pandas (preprocess_excel.py)
import facultyContext from '../data/facultyContext.json';
import departmentContext from '../data/departmentContext.json';
import publicationContext from '../data/publicationContext.json';

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

  // ── Build search indexes from pre-processed data (once) ──
  const { facultyIndex, pubIndex } = useMemo(() => {
    // Faculty index: name tokens → faculty entries
    const fIndex = facultyContext.map(f => ({
      ...f,
      _nameTokens: (f.name || '').toLowerCase().split(/[\s.]+/).filter(w => w.length >= 2),
      _nameLower: (f.name || '').toLowerCase(),
      _deptLower: (f.department || '').toLowerCase(),
      _instLower: (f.institute || '').toLowerCase(),
    }));

    return { facultyIndex: fIndex, pubIndex: publicationContext };
  }, []);

  // ── Rough token estimator (1 token ≈ 4 chars) ──
  const estimateTokens = (text) => Math.ceil((text || '').length / 4);

  // Max tokens for system prompt context (Groq free tier = 12K TPM, reserve 4K for response + chat history + overhead)
  const MAX_CONTEXT_TOKENS = 5500;

  // ── Base context from dashboard aggregated data (~1.5K tokens) ──
  const baseContext = useMemo(() => {
    if (!contextData) return "No data available yet.";

    const kpis = contextData.universityKPIs || {};
    const targets = contextData.universityTargets || {};
    const qRank = contextData.universityQRankDistribution || [];
    const topFaculty = contextData.topUniversityFaculty || [];
    const campus = contextData.campusData || [];
    const articleTypes = contextData.universityArticleTypes || [];
    const pubsByYear = contextData.publicationsByYearSummary || {};
    const campusTrend = contextData.campusTrend || [];
    const nirfTrajectory = contextData.nirfTrajectory || [];
    const peerComparison = contextData.peerComparison || [];
    const phdPipeline = contextData.universityPhDPipeline || {};
    const funding = contextData.universityFundingPortfolio || [];
    const hIndexTrend = contextData.universityHIndexTrend || [];

    return `=== KPI SUMMARY ===
Total Publications: ${kpis.totalPubs?.value || 0} (YoY: ${kpis.yoyGrowth?.value || 0}%)
Scopus Citations: ${kpis.totalCitations?.value || 0} | Max H-Index: ${kpis.univHIndex?.value || 0} | Q1%: ${kpis.q1Percent?.value || 0}%
Campus: BVB ${kpis.campusSplit?.bvb || 0}%, Belagavi ${kpis.campusSplit?.belagavi || 0}%, Bengaluru ${kpis.campusSplit?.bengaluru || 0}%
SRG Density: ${kpis.srgDensity?.value || 0}% | 5Y CAGR: ${kpis.cagr5y?.value || 0}%

=== TARGETS (current/target) ===
Pubs: ${targets.publications?.current || 0}/${targets.publications?.target || 0} | Citations: ${targets.citations?.current || 0}/${targets.citations?.target || 0} | H-Index: ${targets.hIndex?.current || 0}/${targets.hIndex?.target || 0} | Q1%: ${targets.q1Percent?.current || 0}/${targets.q1Percent?.target || 0} | Funding: Rs.${targets.fundingCrore?.current || 0}Cr/Rs.${targets.fundingCrore?.target || 0}Cr | NIRF: ${targets.nirfRank?.current || 'N/A'}/${targets.nirfRank?.target || 'N/A'} | Patents: ${targets.patents?.current || 0}/${targets.patents?.target || 0} | PhD: ${targets.phdCompletions?.current || 0}/${targets.phdCompletions?.target || 0}

=== YEAR-WISE PUBLICATIONS ===
${Object.entries(pubsByYear).sort((a, b) => Number(a[0]) - Number(b[0])).map(([y, c]) => `${y}: ${c}`).join(' | ')}

=== CAMPUS PERFORMANCE ===
${campus.map(c => `${c.name}: ${c.actual} pubs (target ${c.target})`).join(' | ')}

=== CAMPUS TREND ===
${campusTrend.map(c => `${c.year}: BVB=${c.BVB}, Bel=${c.Belagavi}, Blr=${c.Bengaluru}`).join(' | ')}

=== Q-RANK ===
${qRank.map(q => `${q.name}: ${q.value}`).join(' | ')}

=== TOP 10 FACULTY (Scopus Citations) ===
${topFaculty.map((f, i) => `${i + 1}. ${f.name} (${f.department}): ${f.value} cit`).join('\n')}

=== ARTICLE TYPES ===
${articleTypes.map(a => `${a.name}: ${a.value}`).join(' | ')}

=== DEPARTMENTS (${departmentContext.length}) ===
${departmentContext.slice(0, 15).map(d => `${d.department}: ${d.totalPubs} pubs, ${d.totalCitations} cit, H:${d.avgHIndex}, Q1:${d.qRank.Q1}`).join('\n')}

=== NIRF ===
${nirfTrajectory.map(n => `${n.year}:#${n.rank}`).join(' | ')}

=== PEERS ===
${peerComparison.map(p => `${p.name}: ${p.publications} pubs, H:${p.hIndex}, Q1:${p.q1Percent}%`).join('\n')}

=== FUNDING ===
${funding.map(f => `${f.name}: Rs.${f.value}Cr`).join(' | ')} | Total: Rs.${funding.reduce((s, f) => s + f.value, 0).toFixed(1)}Cr

=== PhD ===
${phdPipeline.total || 0} scholars | Done: ${phdPipeline.completedThisYear || 0} | OnTrack: ${phdPipeline.onTrack || 0}, Delayed: ${phdPipeline.delayed || 0}

=== H-INDEX TREND ===
${hIndexTrend.map(h => `${h.year}: BVB=${h.BVB}`).join(' | ')}

Total faculty: ${facultyIndex.length} | Total publications: ${pubIndex.length}`;
  }, [contextData, facultyIndex, pubIndex]);

  // ── Helper: format publication list within token budget ──
  const formatPubList = (pubs, tokenBudget) => {
    let result = '';
    const pubLine = (p, i) => `${i + 1}. "${p.title || 'Untitled'}" | ${p.journal || p.SOURCE_PUBLICATION || 'N/A'} | ${p.year || 'N/A'} | ${p.qrank || p.qrankScopus || 'N/A'}\n`;

    // Calculate how many pubs fit in the budget
    const avgLineTokens = 40; // ~160 chars per line
    const maxByBudget = Math.max(5, Math.floor(Math.max(0, tokenBudget - 50) / avgLineTokens));
    const maxPubs = Math.min(pubs.length, maxByBudget, 30);

    if (maxPubs >= pubs.length) {
      result += `\nALL ${pubs.length} PUBLICATIONS:\n`;
      pubs.forEach((p, i) => { result += pubLine(p, i); });
    } else {
      result += `\n${pubs.length} PUBLICATIONS (showing ${maxPubs}, use FACTS/counts above for exact totals):\n`;
      pubs.slice(0, maxPubs).forEach((p, i) => { result += pubLine(p, i); });
    }
    return result;
  };

  // ── Dynamic query context: search pre-processed indexes ──
  const buildQueryContext = (query) => {
    const q = query.toLowerCase();
    const stopWords = new Set(['the', 'and', 'for', 'how', 'many', 'what', 'who', 'give', 'get', 'me', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'of', 'to', 'a', 'an', 'by', 'stats', 'statistics', 'about', 'show', 'list', 'tell', 'details', 'data', 'info', 'information', 'publications', 'publication', 'faculty', 'researcher', 'department', 'institute', 'year', 'total', 'number', 'count', 'please', 'can', 'you', 'do', 'has', 'have', 'with', 'from', 'all', 'paper', 'papers', 'titles', 'title', 'journal', 'journals', 'research', 'work', 'works', 'their', 'them', 'author', 'authors', 'name', 'professor', 'prof', 'doctor', 'published', 'wrote', 'written', 'done', 'did', 'much', 'specific', 'specifically']);
    const queryWords = q.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));

    if (queryWords.length === 0) return '';

    // Token budget for query context (total budget minus base context)
    const baseTokens = estimateTokens(baseContext);
    const queryBudget = MAX_CONTEXT_TOKENS - baseTokens;

    let extra = '';

    // Extract year from query
    const yearMatch = q.match(/\b(20[12]\d)\b/);
    const targetYear = yearMatch ? yearMatch[1] : null;

    // Extract Q-rank mention
    const qrankMatch = q.match(/\bq([1-4])\b/i);
    const targetQRank = qrankMatch ? `Q${qrankMatch[1]}` : null;

    // ── Search faculty by name ──
    const nameWords = queryWords.filter(w => w.length >= 3);
    const matchedFaculty = nameWords.length > 0 ? facultyIndex.filter(f => {
      return nameWords.some(w => {
        if (w.length < 4) return false;
        return f._nameLower.includes(w) && (
          f._nameLower.startsWith(w) ||
          f._nameLower.includes(' ' + w) ||
          f._nameLower.includes('.' + w)
        );
      });
    }) : [];

    // ── Search faculty by department ──
    const deptWords = queryWords.filter(w => w.length >= 4);
    const deptMatchedFaculty = deptWords.length > 0 ? facultyIndex.filter(f => {
      return deptWords.some(w => f._deptLower.includes(w) || f._instLower.includes(w));
    }) : [];

    // ── Faculty match ──
    if (matchedFaculty.length > 0 && matchedFaculty.length <= 20) {
      extra += `\n=== MATCHED FACULTY (${matchedFaculty.length}) ===\n`;
      matchedFaculty.forEach(f => {
        extra += `\n--- ${f.name} ---\n`;
        extra += `Dept: ${f.department} | Inst: ${f.institute}\n`;
        extra += `Pubs: ${f.totalPubs} (matched: ${f.matchedPubs}) | Scopus Cit: ${f.scopusCitations} | H-Index: ${f.scopusHIndex}\n`;
        extra += `Q1:${f.scopusQ1} Q2:${f.scopusQ2} | Journals:${f.journalCount} Conf:${f.conferenceCount}\n`;
        extra += `Year-wise: ${Object.entries(f.byYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([y, c]) => `${y}:${c}`).join(', ')}\n`;
        extra += `Q-rank: Q1:${f.byQRank.Q1}, Q2:${f.byQRank.Q2}, Q3:${f.byQRank.Q3}, Q4:${f.byQRank.Q4}, Unranked:${f.byQRank.Unranked}\n`;

        // Get publications, apply filters
        let pubs = f.publications || [];
        if (targetYear) {
          const yf = pubs.filter(p => String(p.year) === targetYear);
          if (yf.length > 0) pubs = yf;
        }
        if (targetQRank) {
          const qf = pubs.filter(p => (p.qrank || '').toUpperCase() === targetQRank);
          if (qf.length > 0) pubs = qf;
        }

        if (pubs.length > 0) {
          // Pre-aggregated counts (always accurate)
          const yrCounts = {};
          const qCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
          pubs.forEach(p => {
            yrCounts[p.year] = (yrCounts[p.year] || 0) + 1;
            const qr = (p.qrank || '').toUpperCase();
            if (qCounts[qr] !== undefined) qCounts[qr]++;
            else qCounts.Unranked++;
          });
          extra += `FACTS: ${pubs.length} pubs${targetYear ? ` in ${targetYear}` : ''}${targetQRank ? ` ${targetQRank}` : ''}\n`;
          extra += `Years: ${Object.entries(yrCounts).sort((a, b) => Number(b[0]) - Number(a[0])).map(([y, c]) => `${y}:${c}`).join(', ')}\n`;
          extra += `Q-rank: Q1:${qCounts.Q1}, Q2:${qCounts.Q2}, Q3:${qCounts.Q3}, Q4:${qCounts.Q4}\n`;

          // Pub list with budget
          const remainingBudget = queryBudget - estimateTokens(extra);
          extra += formatPubList(pubs, remainingBudget);
        }
      });
    }

    // ── Department match ──
    if (deptMatchedFaculty.length > 0 && matchedFaculty.length === 0) {
      const totalPubs = deptMatchedFaculty.reduce((s, f) => s + f.matchedPubs, 0);
      const totalCit = deptMatchedFaculty.reduce((s, f) => s + f.scopusCitations, 0);
      const avgH = (deptMatchedFaculty.reduce((s, f) => s + f.scopusHIndex, 0) / deptMatchedFaculty.length).toFixed(1);
      extra += `\n=== DEPARTMENT MATCH (${deptMatchedFaculty.length} faculty) ===\n`;
      extra += `Total Pubs: ${totalPubs} | Citations: ${totalCit} | Avg H-Index: ${avgH}\n`;
      extra += `\nFaculty:\n`;
      deptMatchedFaculty
        .sort((a, b) => b.scopusCitations - a.scopusCitations)
        .slice(0, 30)
        .forEach((f, i) => {
          extra += `${i + 1}. ${f.name} | Pubs:${f.matchedPubs} | Cit:${f.scopusCitations} | H:${f.scopusHIndex} | Q1:${f.scopusQ1}\n`;
        });
      if (deptMatchedFaculty.length > 30) {
        extra += `... and ${deptMatchedFaculty.length - 30} more faculty\n`;
      }
    }

    // ── Year-specific query without faculty match ──
    if (targetYear && matchedFaculty.length === 0 && deptMatchedFaculty.length === 0) {
      const yearPubs = pubIndex.filter(p => String(p.year) === targetYear);
      if (yearPubs.length > 0) {
        const qCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
        const deptCounts = {};
        const typeCounts = {};
        yearPubs.forEach(p => {
          const qr = (p.qrankScopus || '').toUpperCase();
          if (qCounts[qr] !== undefined) qCounts[qr]++;
          else qCounts.Unranked++;
          deptCounts[p.department || 'Unknown'] = (deptCounts[p.department || 'Unknown'] || 0) + 1;
          typeCounts[p.articleType || 'Unknown'] = (typeCounts[p.articleType || 'Unknown'] || 0) + 1;
        });

        extra += `\n=== PUBLICATIONS IN ${targetYear}: ${yearPubs.length} total ===\n`;
        extra += `Q-rank: Q1:${qCounts.Q1}, Q2:${qCounts.Q2}, Q3:${qCounts.Q3}, Q4:${qCounts.Q4}, Unranked:${qCounts.Unranked}\n`;
        extra += `By Department: ${Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d}:${c}`).join(', ')}\n`;
        extra += `By Type: ${Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`).join(', ')}\n`;

        // Apply Q-rank filter
        let finalPubs = yearPubs;
        if (targetQRank) {
          const qf = yearPubs.filter(p => (p.qrankScopus || '').toUpperCase() === targetQRank);
          if (qf.length > 0) {
            finalPubs = qf;
            extra += `Filtered to ${targetQRank}: ${finalPubs.length}\n`;
          }
        }

        const remainingBudget = queryBudget - estimateTokens(extra);
        extra += formatPubList(finalPubs, remainingBudget);
      }
    }

    // ── General keyword search ──
    if (!extra && nameWords.length > 0) {
      const matched = pubIndex.filter(p => {
        const searchable = [p.title, p.journal, p.homeAuthors, p.department, p.technologyAreas]
          .map(v => (v || '').toLowerCase()).join(' ');
        return nameWords.some(w => w.length >= 3 && searchable.includes(w));
      });

      if (matched.length > 0) {
        let filtered = matched;
        if (targetYear) {
          const yf = matched.filter(p => String(p.year) === targetYear);
          if (yf.length > 0) filtered = yf;
        }
        if (targetQRank) {
          const qf = filtered.filter(p => (p.qrankScopus || '').toUpperCase() === targetQRank);
          if (qf.length > 0) filtered = qf;
        }

        const qCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Unranked: 0 };
        const yrCounts = {};
        filtered.forEach(p => {
          const qr = (p.qrankScopus || '').toUpperCase();
          if (qCounts[qr] !== undefined) qCounts[qr]++;
          else qCounts.Unranked++;
          yrCounts[p.year] = (yrCounts[p.year] || 0) + 1;
        });

        extra += `\n=== SEARCH RESULTS: ${filtered.length} publications ===\n`;
        extra += `Q-rank: Q1:${qCounts.Q1}, Q2:${qCounts.Q2}, Q3:${qCounts.Q3}, Q4:${qCounts.Q4}, Unranked:${qCounts.Unranked}\n`;
        extra += `By year: ${Object.entries(yrCounts).sort((a, b) => Number(b[0]) - Number(a[0])).map(([y, c]) => `${y}:${c}`).join(', ')}\n`;

        const remainingBudget = queryBudget - estimateTokens(extra);
        extra += formatPubList(filtered, remainingBudget);
      }
    }

    if (!extra) {
      extra = '\n(No specific match — using aggregate data only.)';
    }

    return extra;
  };

  const callGroqRef = useRef(null);
  const callGroq = async (promptText) => {
    const queryContext = buildQueryContext(promptText);

    const systemInstruction = activeChartContext
      ? `You are KLE Tech's Research AI. Answer ONLY about the "${activeChartContext.title}" chart.

CHART DATA:
${activeChartContext.contextSummary}

DASHBOARD:
${baseContext}
${queryContext}

RULES: Use only data above. No invented numbers. If unrelated to ${activeChartContext.title}, tell user to click the relevant chart.`
      : `You are the Research AI Assistant for KLE Technological University's Dean of R&D.

DATA:
${baseContext}
${queryContext}

RULES:
1. Use ONLY the data above. Do not invent names or numbers.
2. For counts, use FACTS/pre-computed numbers — do NOT count listed records manually.
3. List publication titles from the PUBLICATIONS section when asked. All data is real and verified.
4. If data is unavailable, say so — do not speculate.
5. Be concise. Use bullet points.`;

    const url = 'https://api.groq.com/openai/v1/chat/completions';

    // Include last 4 conversation turns for follow-up context
    const recentHistory = messages.slice(-4).map(m => ({
      role: m.isBot ? 'assistant' : 'user',
      content: m.text,
    }));

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemInstruction },
            ...recentHistory,
            { role: "user", content: promptText }
          ],
          temperature: 0.1,
          max_tokens: 2048
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Groq API Error");

      return data.choices[0].message.content;
    } catch (err) {
      console.error(err);
      return "Sorry, I ran into an error connecting to Groq: " + err.message;
    }
  };
  callGroqRef.current = callGroq;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const userMsg = { id: Date.now(), text: input, isBot: false };
    const currentInput = input;

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const reply = await callGroq(currentInput);

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
                    {apiKey ? (
                      <><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span> Available</>
                    ) : (
                      <><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Needs API Key</>
                    )}
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
                    To use the live AI analytics, please provide a free Groq API key (starts with gsk_...). It is kept securely in your local browser storage.
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
                placeholder={apiKey ? "Ask your data anything..." : "Please configure API Key above..."}
                disabled={!apiKey}
                className="flex-1 bg-fog border border-mist rounded-xl px-md py-3 text-sm focus:outline-none focus:border-kle-crimson focus:ring-2 focus:ring-kle-crimson/20 transition-all font-body text-kle-dark placeholder:text-smoke disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping || !apiKey}
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
