const { useState, useEffect, useRef } = React;

const App = () => {
  const [currentPage, setCurrentPage] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [viewingAgent, setViewingAgent] = useState(null);
  const [generating, setGenerating] = useState([]);
  const [reminderCount, setReminderCount] = useState(0);
  const approvalRefreshRef = useRef(null);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch {}
  };

  const fetchPendingCount = async () => {
    try {
      const res = await fetch('/api/approvals/count');
      const data = await res.json();
      setPendingCount(data.count || 0);
    } catch {}
  };

  const fetchReminderCount = async () => {
    try {
      const res = await fetch('/api/reminders/count');
      const data = await res.json();
      setReminderCount(data.count || 0);
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
    fetchAgents();
    fetchPendingCount();
    fetchReminderCount();
    fetchStatus();
    const interval = setInterval(() => {
      fetchPendingCount();
      fetchReminderCount();
      fetchStatus();
    }, 10000);
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
            // Update step for matching generating item
            setGenerating(prev => prev.map(g =>
              g.agent_id === data.agent_id ? { ...g, step: data.step } : g
            ));
          } else if (evtType === 'new_approval') {
            setGenerating(prev => prev.filter(g =>
              !(g.agent_id === data.approval?.agent_id)
            ));
            fetchPendingCount();
            if (approvalRefreshRef.current) approvalRefreshRef.current();
            if (Notification.permission === 'granted') {
              new Notification('New approval pending', {
                body: `Agent: ${data.approval?.agent_name || 'Unknown'}`,
              });
            }
          } else if (evtType === 'reply_sent') {
            setGenerating(prev => prev.filter(g =>
              !(g.agent_id === data.agent_id)
            ));
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(connect, 3000);
    };
    connect();
    if (Notification.permission === 'default') Notification.requestPermission();
    return () => { if (ws) ws.close(); };
  }, []);

  // Auto-clear stale generating items
  useEffect(() => {
    const interval = setInterval(() => {
      setGenerating(prev => prev.filter(g => Date.now() - g.startTime < 60000));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveAgent = async (formData) => {
    const method = formData.id ? 'PUT' : 'POST';
    const url = formData.id ? `/api/agents/${formData.id}` : '/api/agents';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to save agent');
      return;
    }
    setShowForm(false);
    setEditingAgent(null);
    fetchAgents();
  };

  const handleToggleAgent = async (id) => {
    await fetch(`/api/agents/${id}/toggle`, { method: 'PATCH' });
    fetchAgents();
  };

  const handleDeleteAgent = async (id) => {
    if (!confirm('Delete this agent?')) return;
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    fetchAgents();
  };

  const renderPage = () => {
    if (viewingAgent) {
      return <ConversationViewer agent={viewingAgent} onBack={() => setViewingAgent(null)} />;
    }
    if (showForm) {
      return (
        <AgentForm
          agent={editingAgent}
          onSave={handleSaveAgent}
          onCancel={() => { setShowForm(false); setEditingAgent(null); }}
        />
      );
    }
    switch (currentPage) {
      case 'agents':
        return (
          <AgentList
            agents={agents}
            onEdit={(a) => { setEditingAgent(a); setShowForm(true); }}
            onToggle={handleToggleAgent}
            onDelete={handleDeleteAgent}
            onViewConversation={setViewingAgent}
            onCreate={() => { setEditingAgent(null); setShowForm(true); }}
          />
        );
      case 'approvals':
        return (
          <ApprovalQueue
            onRefresh={fetchPendingCount}
            generating={generating}
            registerRefresh={(fn) => { approvalRefreshRef.current = fn; }}
          />
        );
      case 'reminders':
        return <RemindersPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        currentPage={currentPage}
        setCurrentPage={(page) => {
          setCurrentPage(page);
          setShowForm(false);
          setEditingAgent(null);
          setViewingAgent(null);
        }}
        pendingCount={pendingCount + generating.length}
        reminderCount={reminderCount}
        mcpConnected={mcpConnected}
      />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {renderPage()}
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
