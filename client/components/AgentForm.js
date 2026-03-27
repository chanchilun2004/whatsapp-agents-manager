const AgentForm = ({ agent, onSave, onCancel }) => {
  const [form, setForm] = React.useState({
    name: '',
    system_prompt: '',
    target_jid: '',
    target_name: '',
    llm_provider: 'openai',
    llm_model: 'gpt-4o',
    auto_reply_mode: 'off',
    context_message_count: 20,
    role: 'general',
    ...(agent || {}),
  });
  const [saving, setSaving] = React.useState(false);
  const [targets, setTargets] = React.useState([]);
  const [loadingTargets, setLoadingTargets] = React.useState(false);

  // Chat browser state
  const [allChats, setAllChats] = React.useState([]);
  const [chatQuery, setChatQuery] = React.useState('');
  const [loadingChats, setLoadingChats] = React.useState(false);
  const [aiDetecting, setAiDetecting] = React.useState(false);
  const [aiSuggestions, setAiSuggestions] = React.useState([]);
  const searchTimeoutRef = React.useRef(null);

  const models = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'],
    gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  };

  const roleTemplates = {
    sales: `You are a professional sales representative. Be helpful, answer product/service questions, identify client needs, qualify leads, and guide conversations toward a deal. Always be polite, professional, and proactive about follow-ups. Respond in the customer's language.`,
    customer_success: `You are a dedicated customer success manager. Help clients with onboarding, resolve issues proactively, monitor satisfaction, and ensure they get maximum value from our product/service. Be empathetic, solution-oriented, and responsive. Respond in the customer's language.`,
  };

  // Load existing targets when editing
  React.useEffect(() => {
    if (agent && agent.id) {
      setLoadingTargets(true);
      fetch(`/api/agents/${agent.id}/targets`)
        .then(r => r.json())
        .then(data => setTargets(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoadingTargets(false));
    }
  }, [agent?.id]);

  // Load chats on mount
  React.useEffect(() => {
    fetchChats('');
  }, []);

  const fetchChats = async (q) => {
    setLoadingChats(true);
    try {
      const url = q ? `/api/chats/search?q=${encodeURIComponent(q)}` : '/api/chats?limit=50';
      const res = await fetch(url);
      const data = await res.json();
      setAllChats(Array.isArray(data) ? data : []);
    } catch {}
    setLoadingChats(false);
  };

  const handleSearchChats = (e) => {
    const val = e.target.value;
    setChatQuery(val);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => fetchChats(val), 300);
  };

  const handleChange = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'llm_provider') next.llm_model = models[value][0];
      return next;
    });
  };

  const isSelected = (jid) => targets.some(t => t.chat_jid === jid);

  const toggleChat = (chat) => {
    const jid = chat.jid || chat.chat_jid;
    const name = chat.name || '';
    if (isSelected(jid)) {
      setTargets(prev => prev.filter(t => t.chat_jid !== jid));
    } else {
      setTargets(prev => [...prev, { chat_jid: jid, chat_name: name, auto_reply_mode: null }]);
    }
  };

  const setTargetMode = (jid, mode) => {
    setTargets(prev => prev.map(t => t.chat_jid === jid ? { ...t, auto_reply_mode: mode === 'default' ? null : mode } : t));
  };

  const handleAiDetect = async () => {
    setAiDetecting(true);
    setAiSuggestions([]);
    try {
      const res = await fetch('/api/agents/detect-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: form.role }),
      });
      const data = await res.json();
      if (data.chats && data.chats.length > 0) {
        setAiSuggestions(data.chats);
        // Auto-select AI-recommended chats
        const newTargets = [...targets];
        for (const rec of data.chats) {
          if (!newTargets.some(t => t.chat_jid === rec.jid)) {
            newTargets.push({ chat_jid: rec.jid, chat_name: rec.name });
          }
        }
        setTargets(newTargets);
      }
    } catch (err) {
      console.error('AI detect failed:', err);
    }
    setAiDetecting(false);
  };

  const handleSelectAll = () => {
    const newTargets = [...targets];
    for (const chat of allChats) {
      const jid = chat.jid || chat.chat_jid;
      if (!newTargets.some(t => t.chat_jid === jid)) {
        newTargets.push({ chat_jid: jid, chat_name: chat.name || '' });
      }
    }
    setTargets(newTargets);
  };

  const handleDeselectAll = () => {
    const chatJids = new Set(allChats.map(c => c.jid || c.chat_jid));
    setTargets(prev => prev.filter(t => !chatJids.has(t.chat_jid)));
  };

  const handleApplyTemplate = () => {
    if (form.role !== 'general' && roleTemplates[form.role]) {
      if (!form.system_prompt || confirm('Replace current system prompt with template?')) {
        handleChange('system_prompt', roleTemplates[form.role]);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const savedAgent = await onSave(form);
      const agentId = form.id || savedAgent?.id;
      if (agentId && form.role !== 'general') {
        const currentRes = await fetch(`/api/agents/${agentId}/targets`);
        const currentTargets = await currentRes.json();
        const currentJids = new Set(currentTargets.map(t => t.chat_jid));
        const newJids = new Set(targets.map(t => t.chat_jid));
        for (const t of targets) {
          if (!currentJids.has(t.chat_jid)) {
            await fetch(`/api/agents/${agentId}/targets`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_jid: t.chat_jid, chat_name: t.chat_name, auto_reply_mode: t.auto_reply_mode }),
            });
          } else {
            // Update mode if changed
            await fetch(`/api/agents/${agentId}/targets/${encodeURIComponent(t.chat_jid)}/mode`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ auto_reply_mode: t.auto_reply_mode || 'default' }),
            });
          }
        }
        for (const t of currentTargets) {
          if (!newJids.has(t.chat_jid)) {
            await fetch(`/api/agents/${agentId}/targets/${encodeURIComponent(t.chat_jid)}`, { method: 'DELETE' });
          }
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const getAiReason = (jid) => {
    const s = aiSuggestions.find(a => a.jid === jid);
    return s ? s.reason : null;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl mx-auto fade-in">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{agent ? 'Edit Agent' : 'Create Agent'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
          <input
            type="text" value={form.name} onChange={e => handleChange('name', e.target.value)} required
            placeholder="e.g. Sales Bot"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Role Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Role</label>
          <div className="flex gap-3">
            {[
              { value: 'general', label: 'General', desc: 'No pipeline tracking' },
              { value: 'sales', label: 'Sales', desc: 'Lead to Close pipeline' },
              { value: 'customer_success', label: 'Customer Success', desc: 'Onboarding to Renewal' },
            ].map(opt => (
              <label key={opt.value} className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors text-center
                ${form.role === opt.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="role" value={opt.value} checked={form.role === opt.value}
                  onChange={e => handleChange('role', e.target.value)} className="sr-only" />
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">System Prompt (Personality)</label>
            {form.role !== 'general' && (
              <button type="button" onClick={handleApplyTemplate} className="text-xs text-brand-600 hover:underline">
                Use {form.role === 'sales' ? 'Sales' : 'CS'} template
              </button>
            )}
          </div>
          <textarea value={form.system_prompt} onChange={e => handleChange('system_prompt', e.target.value)}
            required rows={4} placeholder="You are a helpful assistant..."
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        {/* Chat Target Selector */}
        {form.role !== 'general' ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Assigned Chats <span className="text-gray-400 font-normal">({targets.length} selected)</span>
              </label>
              <button
                type="button" onClick={handleAiDetect} disabled={aiDetecting}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                  aiDetecting
                    ? 'bg-brand-100 text-brand-400 cursor-wait'
                    : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm'}`}
              >
                {aiDetecting ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    Analyzing chats...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    AI Detect
                  </>
                )}
              </button>
            </div>

            {/* AI suggestions banner */}
            {aiSuggestions.length > 0 && (
              <div className="mb-2 p-2.5 bg-brand-50 border border-brand-200 rounded-lg">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <span className="text-xs font-semibold text-brand-700">AI recommended {aiSuggestions.length} chat{aiSuggestions.length > 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-1">
                  {aiSuggestions.map(s => (
                    <div key={s.jid} className="text-[11px] text-brand-600">
                      <span className="font-medium">{s.name}</span>: {s.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected targets with per-chat mode */}
            {targets.length > 0 && (
              <div className="mb-2 space-y-1">
                {targets.map(t => {
                  const effectiveMode = t.auto_reply_mode || form.auto_reply_mode;
                  const modeLabel = { off: 'Off', semi: 'Semi', full: 'Full' };
                  const modeColor = { off: 'bg-gray-400', semi: 'bg-amber-400', full: 'bg-emerald-400' };
                  return (
                    <div key={t.chat_jid} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${
                      getAiReason(t.chat_jid) ? 'bg-brand-50/50 border-brand-200' : 'bg-gray-50 border-gray-100'}`}>
                      {getAiReason(t.chat_jid) && (
                        <span className="text-[9px] font-bold text-brand-600 bg-brand-100 px-1 py-0.5 rounded shrink-0">AI</span>
                      )}
                      <span className="truncate flex-1 text-gray-700">{t.chat_name || t.chat_jid}</span>
                      <select
                        value={t.auto_reply_mode || 'default'}
                        onChange={(e) => setTargetMode(t.chat_jid, e.target.value)}
                        className="text-[11px] border rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="default">Default ({modeLabel[form.auto_reply_mode]})</option>
                        <option value="off">Off</option>
                        <option value="semi">Semi-Auto</option>
                        <option value="full">Full-Auto</option>
                      </select>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${modeColor[effectiveMode]}`} title={modeLabel[effectiveMode]}></span>
                      <button type="button" onClick={() => toggleChat({ jid: t.chat_jid, name: t.chat_name })}
                        className="text-gray-400 hover:text-red-500 shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search + Select/Deselect all */}
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={chatQuery} onChange={handleSearchChats}
                  placeholder="Search chats..." className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button type="button" onClick={handleSelectAll} className="text-[11px] text-brand-600 hover:underline whitespace-nowrap">Select All</button>
              <button type="button" onClick={handleDeselectAll} className="text-[11px] text-gray-500 hover:underline whitespace-nowrap">Clear</button>
            </div>

            {/* Chat list with checkboxes */}
            <div className="max-h-56 overflow-y-auto border rounded-lg">
              {loadingChats ? (
                <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                  <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Loading...
                </div>
              ) : loadingTargets ? (
                <div className="py-6 text-center text-gray-400 text-sm">Loading targets...</div>
              ) : allChats.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-sm">No chats found</div>
              ) : (
                allChats.map(chat => {
                  const jid = chat.jid || chat.chat_jid;
                  const name = chat.name || jid;
                  const selected = isSelected(jid);
                  const aiReason = getAiReason(jid);
                  return (
                    <label key={jid}
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 cursor-pointer transition-colors
                        ${selected ? 'bg-brand-50/50' : 'hover:bg-gray-50'}
                        ${aiReason ? 'border-l-2 border-l-brand-400' : ''}`}
                    >
                      <input type="checkbox" checked={selected} onChange={() => toggleChat(chat)}
                        className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm truncate ${selected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{name}</span>
                          {aiReason && (
                            <span className="shrink-0 text-[9px] font-medium text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded">AI</span>
                          )}
                        </div>
                        {aiReason && (
                          <div className="text-[11px] text-brand-500 truncate mt-0.5">{aiReason}</div>
                        )}
                        {!aiReason && chat.last_message && (
                          <div className="text-[11px] text-gray-400 truncate mt-0.5">{chat.last_message}</div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target WhatsApp Chat</label>
            {form.target_jid && (
              <div className="mb-2 text-sm text-gray-600">
                Selected: <span className="font-medium">{form.target_name || form.target_jid}</span>
              </div>
            )}
            <ChatBrowser onSelect={(chat) => {
              handleChange('target_jid', chat.jid || chat.chat_jid);
              handleChange('target_name', chat.name || '');
            }} selectedJid={form.target_jid} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LLM Provider</label>
            <select value={form.llm_provider} onChange={e => handleChange('llm_provider', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select value={form.llm_model} onChange={e => handleChange('llm_model', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
              {models[form.llm_provider].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Reply Mode</label>
          <div className="flex gap-3">
            {[
              { value: 'off', label: 'Off', desc: 'No auto-reply' },
              { value: 'semi', label: 'Semi-Auto', desc: 'Drafts for approval' },
              { value: 'full', label: 'Full-Auto', desc: 'Sends automatically' },
            ].map(opt => (
              <label key={opt.value} className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors text-center
                ${form.auto_reply_mode === opt.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="auto_reply_mode" value={opt.value} checked={form.auto_reply_mode === opt.value}
                  onChange={e => handleChange('auto_reply_mode', e.target.value)} className="sr-only" />
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Context Messages: {form.context_message_count}
          </label>
          <input type="range" min="5" max="50" value={form.context_message_count}
            onChange={e => handleChange('context_message_count', parseInt(e.target.value))} className="w-full" />
          <div className="flex justify-between text-xs text-gray-400"><span>5</span><span>50</span></div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm">
            {saving ? 'Saving...' : (agent ? 'Update Agent' : 'Create Agent')}
          </button>
          <button type="button" onClick={onCancel}
            className="px-6 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
