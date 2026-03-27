const { useState, useEffect, useRef } = React;

const App = () => {
  const [currentPage, setCurrentPage] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedChatJid, setSelectedChatJid] = useState(null);
  const [selectedChatName, setSelectedChatName] = useState(null);
  const [generating, setGenerating] = useState([]);
  const [lastWsMessage, setLastWsMessage] = useState(null);
  const [lastStageUpdate, setLastStageUpdate] = useState(null);
  const approvalRefreshRef = useRef(null);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setAgents(list);
      if (!selectedAgent && list.length > 0) setSelectedAgent(list[0]);
    } catch {}
  };

  const fetchPendingCount = async () => {
    try {
      const res = await fetch('/api/approvals/count');
      const data = await res.json();
      setPendingCount(data.count || 0);
    } catch {}
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setMcpConnected(data.mcp_connected);
    } catch {}
  };

  useEffect(() => {
    fetchAgents(); fetchPendingCount(); fetchStatus();
    const interval = setInterval(() => { fetchPendingCount(); fetchStatus(); }, 10000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    const connect = () => {
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      ws.onmessage = (event) => {
        try {
          const { event: evtType, data } = JSON.parse(event.data);
          if (evtType === 'generating') {
            setGenerating(prev => {
              if (prev.some(g => g.agent_id === data.agent_id && g.trigger_text === data.trigger_text)) return prev;
              return [{ ...data, step: data.step || 'message_received', startTime: Date.now() }, ...prev];
            });
          } else if (evtType === 'pipeline_progress') {
            setGenerating(prev => prev.map(g => g.agent_id === data.agent_id ? { ...g, step: data.step } : g));
          } else if (evtType === 'new_approval') {
            setGenerating(prev => prev.filter(g => !(g.agent_id === data.approval?.agent_id)));
            fetchPendingCount();
            if (approvalRefreshRef.current) approvalRefreshRef.current();
            if (Notification.permission === 'granted') {
              new Notification('New approval pending', { body: `Agent: ${data.approval?.agent_name || 'Unknown'}` });
            }
          } else if (evtType === 'reply_sent') {
            setGenerating(prev => prev.filter(g => !(g.agent_id === data.agent_id)));
            setLastWsMessage({ ...data, _ts: Date.now() });
          } else if (evtType === 'new_message') {
            setLastWsMessage({ ...data, _ts: Date.now() });
          } else if (evtType === 'stage_updated' || evtType === 'stage_changed') {
            setLastStageUpdate({ ...data, _ts: Date.now() });
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(connect, 3000);
    };
    connect();
    if (Notification.permission === 'default') Notification.requestPermission();
    return () => { if (ws) ws.close(); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setGenerating(prev => prev.filter(g => Date.now() - g.startTime < 60000));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveAgent = async (formData) => {
    const method = formData.id ? 'PUT' : 'POST';
    const url = formData.id ? `/api/agents/${formData.id}` : '/api/agents';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
    if (!res.ok) { const err = await res.json(); alert(err.error || 'Failed to save agent'); return null; }
    const savedAgent = await res.json();
    setShowForm(false); setEditingAgent(null); fetchAgents();
    return savedAgent;
  };

  const handleToggleAgent = async (id) => { await fetch(`/api/agents/${id}/toggle`, { method: 'PATCH' }); fetchAgents(); };

  const handleDeleteAgent = async (id) => {
    if (!confirm('Delete this agent?')) return;
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    if (selectedAgent?.id === id) { setSelectedAgent(null); setSelectedChatJid(null); }
    fetchAgents();
  };

  const handleViewConversation = (agent, chatJid, chatName) => {
    setSelectedAgent(agent);
    setSelectedChatJid(chatJid || agent.target_jid || null);
    setSelectedChatName(chatName || null);
  };

  const handleSelectAgent = (agent) => {
    setSelectedAgent(agent);
    setSelectedChatJid(null);
    setSelectedChatName(null);
    if (!agent.role || agent.role === 'general') {
      setSelectedChatJid(agent.target_jid);
      setSelectedChatName(agent.target_name);
    }
  };

  const renderContent = () => {
    if (showForm) {
      return (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-2xl mx-auto px-4 py-8">
            <AgentForm
              agent={editingAgent}
              onSave={handleSaveAgent}
              onCancel={() => { setShowForm(false); setEditingAgent(null); }}
            />
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case 'agents':
        return (
          <>
            {/* Conversation list panel */}
            <div className="w-[340px] shrink-0 border-r border-gray-200 flex flex-col">
              <AgentList
                agents={agents}
                selectedAgent={selectedAgent}
                selectedChatJid={selectedChatJid}
                lastStageUpdate={lastStageUpdate}
                onSelectAgent={handleSelectAgent}
                onEdit={(a) => { setEditingAgent(a); setShowForm(true); }}
                onToggle={handleToggleAgent}
                onDelete={handleDeleteAgent}
                onViewConversation={handleViewConversation}
                onCreate={() => { setEditingAgent(null); setShowForm(true); }}
              />
            </div>
            {/* Chat area */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedChatJid ? (
                <ConversationViewer
                  key={`${selectedAgent?.id}-${selectedChatJid}`}
                  agent={selectedAgent}
                  chatJid={selectedChatJid}
                  chatNameProp={selectedChatName}
                  onBack={() => setSelectedChatJid(null)}
                  lastWsMessage={lastWsMessage}
                  lastStageUpdate={lastStageUpdate}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                  <div className="text-center max-w-sm">
                    <div className="w-20 h-20 rounded-3xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 text-brand-300" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-700 mb-1">Welcome to Inbox</h2>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Select a conversation from the left panel to start messaging. Choose an agent to view its assigned chats.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        );
      case 'pipeline':
        return (
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <PipelineView onViewConversation={(agent, jid) => { setCurrentPage('agents'); handleViewConversation(agent, jid); }} />
            </div>
          </div>
        );
      case 'approvals':
        return (
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <ApprovalQueue onRefresh={fetchPendingCount} generating={generating} registerRefresh={(fn) => { approvalRefreshRef.current = fn; }} />
            </div>
          </div>
        );
      case 'summaries':
        return (
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <SummariesPage />
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <SettingsPage />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Left icon sidebar */}
      <Header
        currentPage={currentPage}
        setCurrentPage={(page) => { setCurrentPage(page); setShowForm(false); setEditingAgent(null); }}
        pendingCount={pendingCount + generating.length}
        mcpConnected={mcpConnected}
      />
      {/* Main content */}
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
