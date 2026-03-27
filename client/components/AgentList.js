const AgentList = ({ agents, onEdit, onToggle, onDelete, onViewConversation, onCreate, selectedAgent, selectedChatJid, onSelectAgent, lastStageUpdate }) => {
  const modeLabels = { off: 'Manual', semi: 'Semi-Auto', full: 'Full-Auto' };
  const modeColors = { off: 'bg-gray-400', semi: 'bg-amber-400', full: 'bg-emerald-400' };
  const roleLabels = { general: 'General', sales: 'Sales', customer_success: 'CS' };

  const [targets, setTargets] = React.useState({});
  const [stages, setStages] = React.useState({});
  const [chatList, setChatList] = React.useState([]);
  const [chatQuery, setChatQuery] = React.useState('');
  const [loadingChats, setLoadingChats] = React.useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const dropdownRef = React.useRef(null);

  const stageColors = {
    lead: '#6B7280', qualified: '#3B82F6', proposal: '#7C3AED', negotiation: '#F59E0B',
    closed_won: '#10B981', closed_lost: '#EF4444',
    onboarding: '#3B82F6', active: '#10B981', at_risk: '#F59E0B', churned: '#EF4444', renewal: '#7C3AED',
  };

  // Fetch targets and stages for role agents
  React.useEffect(() => {
    agents.forEach(agent => {
      if (agent.role && agent.role !== 'general') {
        fetch(`/api/agents/${agent.id}/targets`)
          .then(r => r.json())
          .then(data => {
            if (Array.isArray(data)) setTargets(prev => ({ ...prev, [agent.id]: data }));
          })
          .catch(() => {});
        fetch(`/api/pipeline/${agent.id}/stage`)
          .then(r => r.json())
          .then(data => {
            if (Array.isArray(data)) {
              const stageMap = {};
              data.forEach(t => { if (t.stage) stageMap[t.chat_jid] = t.stage; });
              setStages(prev => ({ ...prev, [agent.id]: stageMap }));
            }
          })
          .catch(() => {});
      }
    });
  }, [agents]);

  // Update stages from WebSocket
  React.useEffect(() => {
    if (!lastStageUpdate || !lastStageUpdate.agent_id || !lastStageUpdate.chat_jid) return;
    setStages(prev => {
      const agentStages = { ...(prev[lastStageUpdate.agent_id] || {}) };
      agentStages[lastStageUpdate.chat_jid] = { stage: lastStageUpdate.stage };
      return { ...prev, [lastStageUpdate.agent_id]: agentStages };
    });
  }, [lastStageUpdate]);

  // Build chat list from agent targets + stages
  const buildAgentChatList = (agent) => {
    if (agent.role && agent.role !== 'general') {
      const agentTargets = targets[agent.id] || [];
      const agentStages = stages[agent.id] || {};
      return agentTargets.map(t => ({
        jid: t.chat_jid, name: t.chat_name || t.chat_jid, last_message: '',
        auto_reply_mode: t.auto_reply_mode,
        stage: agentStages[t.chat_jid]?.stage || null,
      }));
    }
    return [{ jid: agent.target_jid, name: agent.target_name || agent.target_jid, last_message: '', auto_reply_mode: null, stage: null }];
  };

  React.useEffect(() => {
    if (!selectedAgent) return;
    setChatQuery('');
    setChatList(buildAgentChatList(selectedAgent));
  }, [selectedAgent, targets, stages]);

  // Search
  const searchChats = async (q) => {
    setChatQuery(q);
    if (!q || q.length < 2) {
      if (selectedAgent) setChatList(buildAgentChatList(selectedAgent));
      return;
    }
    setLoadingChats(true);
    try {
      const res = await fetch(`/api/chats/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setChatList(Array.isArray(data) ? data.map(c => ({ jid: c.jid || c.chat_jid, name: c.name || c.jid || c.chat_jid, last_message: c.last_message || '' })) : []);
    } catch {}
    setLoadingChats(false);
  };

  // Close menus
  React.useEffect(() => {
    const close = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowAgentDropdown(false);
      setContextMenu(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleContextMenu = (e, agent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, agent });
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
  };

  const avatarColors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];
  const getAvatarColor = (name) => {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  };

  const filteredAgents = agents.filter(a => {
    if (filter === 'active') return a.is_active;
    if (filter === 'inactive') return !a.is_active;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Top bar */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-gray-900">Inbox</h2>
          <button
            onClick={onCreate}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Agent
          </button>
        </div>

        {/* Agent selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowAgentDropdown(!showAgentDropdown); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left"
          >
            {selectedAgent ? (
              <>
                <div className={`w-7 h-7 rounded-lg ${getAvatarColor(selectedAgent.name)} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-[10px] font-bold">{getInitials(selectedAgent.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate leading-tight">{selectedAgent.name}</div>
                  <div className="text-[11px] text-gray-400 leading-tight flex items-center gap-1">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${modeColors[selectedAgent.auto_reply_mode]}`}></span>
                    {modeLabels[selectedAgent.auto_reply_mode]}
                    <span className="text-gray-300 mx-0.5">/</span>
                    {selectedAgent.llm_model}
                  </div>
                </div>
              </>
            ) : (
              <span className="text-sm text-gray-400">Select an agent...</span>
            )}
            <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${showAgentDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Agent dropdown */}
          {showAgentDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden fade-in">
              {/* Filter tabs */}
              <div className="flex border-b border-gray-100 px-1 pt-1">
                {['all', 'active', 'inactive'].map(f => (
                  <button
                    key={f}
                    onClick={(e) => { e.stopPropagation(); setFilter(f); }}
                    className={`flex-1 text-[11px] font-medium py-1.5 rounded-t-lg transition-colors capitalize
                      ${filter === f ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {f} ({agents.filter(a => f === 'all' ? true : f === 'active' ? a.is_active : !a.is_active).length})
                  </button>
                ))}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredAgents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={(e) => { e.stopPropagation(); onSelectAgent(agent); setShowAgentDropdown(false); }}
                    onContextMenu={(e) => handleContextMenu(e, agent)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-gray-50 transition-colors
                      ${selectedAgent?.id === agent.id ? 'bg-brand-50' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${getAvatarColor(agent.name)} flex items-center justify-center shrink-0 ${!agent.is_active ? 'opacity-40' : ''}`}>
                      <span className="text-white text-[11px] font-bold">{getInitials(agent.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${!agent.is_active ? 'text-gray-400' : 'text-gray-800'}`}>{agent.name}</div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1">
                        <span className="bg-gray-100 text-gray-500 px-1.5 py-0 rounded text-[10px]">{roleLabels[agent.role || 'general']}</span>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${modeColors[agent.auto_reply_mode]}`}></span>
                        <span>{modeLabels[agent.auto_reply_mode]}</span>
                      </div>
                    </div>
                    {selectedAgent?.id === agent.id && (
                      <svg className="w-4 h-4 text-brand-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onCreate(); setShowAgentDropdown(false); }}
                  className="w-full text-left px-3 py-2.5 text-sm text-brand-600 font-medium hover:bg-brand-50 flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create new agent
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={chatQuery}
            onChange={(e) => searchChats(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm bg-gray-50 border border-transparent hover:border-gray-200 focus:bg-white placeholder-gray-400 transition-colors"
          />
        </div>
      </div>

      {/* Agent action bar */}
      {selectedAgent && (
        <div className="px-3 py-1.5 border-b border-gray-100 shrink-0 flex items-center gap-1">
          <button
            onClick={() => onEdit(selectedAgent)}
            className="text-[11px] text-gray-500 hover:text-brand-600 hover:bg-brand-50 px-2 py-1 rounded transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onToggle(selectedAgent.id)}
            className="text-[11px] text-gray-500 hover:text-brand-600 hover:bg-brand-50 px-2 py-1 rounded transition-colors"
          >
            {selectedAgent.is_active ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => onDelete(selectedAgent.id)}
            className="text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            Delete
          </button>
          <div className="flex-1"></div>
          <span className="text-[11px] text-gray-300">{chatList.length} chat{chatList.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-50 min-w-[160px] fade-in" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => { onEdit(contextMenu.agent); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            Edit
          </button>
          <button onClick={() => { onToggle(contextMenu.agent.id); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>
            {contextMenu.agent.is_active ? 'Disable' : 'Enable'}
          </button>
          <hr className="my-1 border-gray-100" />
          <button onClick={() => { onDelete(contextMenu.agent.id); setContextMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-500 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            Delete
          </button>
        </div>
      )}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {!selectedAgent ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-brand-300" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600">
              {agents.length === 0 ? 'No agents yet' : 'Select an agent'}
            </p>
            <p className="text-xs mt-1 text-gray-400">
              {agents.length === 0 ? 'Create your first agent to get started' : 'Choose an agent from the dropdown'}
            </p>
          </div>
        ) : loadingChats ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Loading...
            </div>
          </div>
        ) : chatList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 p-4 text-center">
            <p className="text-sm">No conversations</p>
            <p className="text-xs mt-1">Edit agent to assign chats</p>
          </div>
        ) : (
          chatList.map(chat => {
            const effectiveMode = chat.auto_reply_mode || selectedAgent.auto_reply_mode;
            const isRole = selectedAgent.role && selectedAgent.role !== 'general';
            return (
              <button
                key={chat.jid}
                onClick={() => onViewConversation(selectedAgent, chat.jid, chat.name)}
                className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors border-b border-gray-50
                  ${selectedChatJid === chat.jid
                    ? 'bg-brand-50 border-l-2 border-l-brand-500'
                    : 'hover:bg-gray-50 border-l-2 border-l-transparent'}`}
              >
                <div className="relative shrink-0">
                  <div className={`w-10 h-10 rounded-full ${getAvatarColor(chat.name)} flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{getInitials(chat.name)}</span>
                  </div>
                  {/* Mode indicator dot */}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${modeColors[effectiveMode]}`}
                    title={modeLabels[effectiveMode]}></span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm truncate ${selectedChatJid === chat.jid ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {chat.name || chat.jid}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {/* Stage badge */}
                    {isRole && chat.stage ? (
                      <span className="text-[10px] font-medium text-white px-1.5 py-0 rounded"
                        style={{ backgroundColor: stageColors[chat.stage] || '#6B7280' }}>
                        {chat.stage.replace('_', ' ')}
                      </span>
                    ) : null}
                    {/* Mode label if overridden */}
                    {chat.auto_reply_mode && (
                      <span className={`text-[10px] px-1.5 py-0 rounded ${
                        effectiveMode === 'full' ? 'bg-emerald-50 text-emerald-600' :
                        effectiveMode === 'semi' ? 'bg-amber-50 text-amber-600' :
                        'bg-gray-100 text-gray-500'}`}>
                        {modeLabels[effectiveMode]}
                      </span>
                    )}
                    {/* Fallback text */}
                    {!chat.stage && !chat.auto_reply_mode && (
                      <span className="text-[11px] text-gray-300">Click to open</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
