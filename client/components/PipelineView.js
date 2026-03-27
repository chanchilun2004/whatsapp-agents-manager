const PipelineView = ({ onViewConversation }) => {
  const [role, setRole] = React.useState('sales');
  const [view, setView] = React.useState('kanban');
  const [stages, setStages] = React.useState([]);
  const [definitions, setDefinitions] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [overrideItem, setOverrideItem] = React.useState(null);
  const [overrideStage, setOverrideStage] = React.useState('');

  const fetchData = async () => {
    try {
      const [stagesRes, defsRes] = await Promise.all([
        fetch(`/api/pipeline?role=${role}`),
        fetch('/api/pipeline/definitions'),
      ]);
      const stagesData = await stagesRes.json();
      const defsData = await defsRes.json();
      setStages(Array.isArray(stagesData) ? stagesData : []);
      setDefinitions(defsData);
    } catch (err) {
      console.error('Failed to load pipeline:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [role]);

  const stageDefs = definitions?.[role]?.stages || [];

  const handleOverride = async () => {
    if (!overrideItem || !overrideStage) return;
    try {
      await fetch(`/api/pipeline/${overrideItem.agent_id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_jid: overrideItem.chat_jid, stage: overrideStage, reasoning: 'Manual override from dashboard' }),
      });
      setOverrideItem(null);
      setOverrideStage('');
      fetchData();
    } catch (err) {
      alert('Failed to update stage: ' + err.message);
    }
  };

  const renderCard = (item) => (
    <div key={`${item.agent_id}-${item.chat_jid}`} className="bg-white rounded-lg shadow-sm border p-3 mb-2">
      <div className="font-medium text-sm text-gray-800 truncate">{item.chat_name || item.chat_jid}</div>
      <div className="text-xs text-gray-500 mb-1">Agent: {item.agent_name}</div>
      {item.confidence != null && (
        <div className="text-xs text-gray-400 mb-1">Confidence: {Math.round(item.confidence * 100)}%</div>
      )}
      {item.reasoning && (
        <div className="text-xs text-gray-500 italic mb-2 line-clamp-2">{item.reasoning}</div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{timeAgo(item.updated_at)}</span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              // Find the agent to pass to onViewConversation
              onViewConversation({ id: item.agent_id, name: item.agent_name, role: item.agent_role }, item.chat_jid);
            }}
            className="text-xs text-whatsapp-dark hover:underline"
          >
            View
          </button>
          <button
            onClick={() => { setOverrideItem(item); setOverrideStage(item.stage); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );

  const renderKanban = () => (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
      {stageDefs.map(def => {
        const items = stages.filter(s => s.stage === def.id);
        return (
          <div key={def.id} className="flex-shrink-0 w-64">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: def.color }}></div>
              <h3 className="font-semibold text-sm text-gray-700">{def.name}</h3>
              <span className="text-xs text-gray-400 ml-auto">{items.length}</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 min-h-[300px]">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No clients</p>
              ) : (
                items.map(renderCard)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderList = () => (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Client</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Agent</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Stage</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Confidence</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Updated</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stages.length === 0 ? (
            <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">No clients in pipeline</td></tr>
          ) : (
            stages.map(item => {
              const def = stageDefs.find(d => d.id === item.stage);
              return (
                <tr key={`${item.agent_id}-${item.chat_jid}`} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{item.chat_name || item.chat_jid}</td>
                  <td className="px-4 py-3 text-gray-600">{item.agent_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: def?.color || '#6B7280' }}>
                      {def?.name || item.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.confidence != null ? `${Math.round(item.confidence * 100)}%` : '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{timeAgo(item.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onViewConversation({ id: item.agent_id, name: item.agent_name, role: item.agent_role }, item.chat_jid)}
                        className="text-xs text-whatsapp-dark hover:underline"
                      >
                        View Chat
                      </button>
                      <button
                        onClick={() => { setOverrideItem(item); setOverrideStage(item.stage); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Move Stage
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Pipeline</h2>
        <div className="flex gap-2">
          {/* Role tabs */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setRole('sales')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${role === 'sales' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600 hover:text-gray-800'}`}
            >
              Sales
            </button>
            <button
              onClick={() => setRole('customer_success')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${role === 'customer_success' ? 'bg-white shadow-sm text-purple-700' : 'text-gray-600 hover:text-gray-800'}`}
            >
              Customer Success
            </button>
          </div>

          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'list' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading pipeline...</div>
      ) : (
        view === 'kanban' ? renderKanban() : renderList()
      )}

      {/* Stage Override Modal */}
      {overrideItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setOverrideItem(null)}>
          <div className="bg-white rounded-xl shadow-lg p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-3">Move Stage</h3>
            <p className="text-sm text-gray-600 mb-3">{overrideItem.chat_name || overrideItem.chat_jid}</p>
            <select
              value={overrideStage}
              onChange={e => setOverrideStage(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg mb-4"
            >
              {stageDefs.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={handleOverride} className="flex-1 bg-whatsapp text-white py-2 rounded-lg text-sm font-medium hover:bg-whatsapp-dark">
                Save
              </button>
              <button onClick={() => setOverrideItem(null)} className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
