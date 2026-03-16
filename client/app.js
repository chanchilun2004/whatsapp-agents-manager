const { useState, useEffect, useCallback } = React;

const App = () => {
  const [currentPage, setCurrentPage] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [viewingAgent, setViewingAgent] = useState(null);

  // Fetch agents
  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  // Fetch pending count
  const fetchPendingCount = async () => {
    try {
      const res = await fetch('/api/approvals/count');
      const data = await res.json();
      setPendingCount(data.count || 0);
    } catch {}
  };

  // Fetch status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setMcpConnected(data.mcp_connected);
    } catch {}
  };

  // Initial load
  useEffect(() => {
    fetchAgents();
    fetchPendingCount();
    fetchStatus();
    const interval = setInterval(() => {
      fetchPendingCount();
      fetchStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for live updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.onmessage = (event) => {
      try {
        const { event: evtType, data } = JSON.parse(event.data);
        if (evtType === 'new_approval') {
          fetchPendingCount();
          // Show notification
          if (Notification.permission === 'granted') {
            new Notification('New approval pending', {
              body: `Agent: ${data.approval?.agent_name || 'Unknown'}`,
            });
          }
        } else if (evtType === 'reply_sent') {
          // Could show a toast
        }
      } catch {}
    };
    ws.onclose = () => setTimeout(() => {}, 5000);

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => ws.close();
  }, []);

  // Agent CRUD
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

  const handleEditAgent = (agent) => {
    setEditingAgent(agent);
    setShowForm(true);
  };

  const handleViewConversation = (agent) => {
    setViewingAgent(agent);
  };

  // Render current page
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
            onEdit={handleEditAgent}
            onToggle={handleToggleAgent}
            onDelete={handleDeleteAgent}
            onViewConversation={handleViewConversation}
            onCreate={() => { setEditingAgent(null); setShowForm(true); }}
          />
        );
      case 'approvals':
        return <ApprovalQueue onRefresh={fetchPendingCount} />;
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
        pendingCount={pendingCount}
        mcpConnected={mcpConnected}
      />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {renderPage()}
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
