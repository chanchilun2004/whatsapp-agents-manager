const ApprovalQueue = ({ onRefresh, generating = [], registerRefresh }) => {
  const [approvals, setApprovals] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('pending');
  const [editingId, setEditingId] = React.useState(null);
  const [editText, setEditText] = React.useState('');

  const fetchApprovals = async () => {
    try {
      const res = await fetch(`/api/approvals?status=${filter}`);
      const data = await res.json();
      setApprovals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchApprovals();
  }, [filter]);

  React.useEffect(() => {
    if (registerRefresh) registerRefresh(fetchApprovals);
  }, [filter]);

  const handleApprove = async (id) => {
    const res = await fetch(`/api/approvals/${id}/approve`, { method: 'POST' });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    fetchApprovals();
    if (onRefresh) onRefresh();
  };

  const handleReject = async (id) => {
    await fetch(`/api/approvals/${id}/reject`, { method: 'POST' });
    fetchApprovals();
    if (onRefresh) onRefresh();
  };

  const handleEdit = (approval) => {
    setEditingId(approval.id);
    setEditText(approval.draft_reply);
  };

  const handleEditSend = async (id) => {
    await fetch(`/api/approvals/${id}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_reply: editText }),
    });
    setEditingId(null);
    fetchApprovals();
    if (onRefresh) onRefresh();
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString();
  };

  const STEP_LABELS = {
    message_received: { icon: '\u{1F4E9}', label: 'Message received' },
    downloading_media: { icon: '\u{1F4F7}', label: 'Downloading media...' },
    fetching_context: { icon: '\u{1F4AC}', label: 'Fetching context...' },
    loading_memory: { icon: '\u{1F9E0}', label: 'Loading memory...' },
    calling_llm: { icon: '\u{1F916}', label: 'AI thinking...' },
    reply_ready: { icon: '\u2705', label: 'Draft ready' },
  };

  const GeneratingCard = ({ item }) => {
    const [dots, setDots] = React.useState('');
    const [elapsed, setElapsed] = React.useState(0);
    React.useEffect(() => {
      const interval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? '' : prev + '.');
        setElapsed(Math.floor((Date.now() - item.startTime) / 1000));
      }, 500);
      return () => clearInterval(interval);
    }, []);

    const currentStep = item.step || 'message_received';
    const stepInfo = STEP_LABELS[currentStep] || STEP_LABELS.message_received;
    const stepKeys = Object.keys(STEP_LABELS);
    const stepIndex = stepKeys.indexOf(currentStep);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-5 fade-in">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className="font-semibold text-gray-800">{item.agent_name}</span>
            <span className="text-sm text-gray-400 ml-2">just now</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 animate-pulse">
            Processing{dots}
          </span>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <div className="text-xs text-gray-500 mb-1">Incoming from {item.trigger_sender}:</div>
          <div className="text-sm text-gray-700">{item.trigger_text}</div>
        </div>

        {/* Progress steps */}
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            <span className="text-sm font-medium text-purple-700">
              {stepInfo.icon} {stepInfo.label}
            </span>
            <span className="text-xs text-purple-400 ml-auto">{elapsed}s</span>
          </div>
          {/* Step progress bar */}
          <div className="flex gap-1">
            {stepKeys.map((key, i) => (
              <div
                key={key}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-purple-500' : 'bg-purple-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Approval Queue</h2>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'edited'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-sm capitalize transition-colors
                ${filter === s ? 'bg-whatsapp text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filter === 'pending' && generating.map((g, i) => (
          <GeneratingCard key={`gen-${g.agent_id}-${i}`} item={g} />
        ))}

        {loading && approvals.length === 0 && generating.length === 0 ? (
          <p className="text-center text-gray-500 py-12">Loading...</p>
        ) : approvals.length === 0 && (filter !== 'pending' || generating.length === 0) ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No {filter} approvals</p>
            {filter === 'pending' && <p>When semi-auto agents draft replies, they'll appear here for your review.</p>}
          </div>
        ) : (
          approvals.map(a => (
            <div key={a.id} className="bg-white rounded-xl shadow-sm border p-5 fade-in">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="font-semibold text-gray-800">{a.agent_name || `Agent #${a.agent_id}`}</span>
                  <span className="text-sm text-gray-400 ml-2">{formatDate(a.created_at)}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full capitalize
                  ${a.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    a.status === 'approved' ? 'bg-green-100 text-green-700' :
                    a.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'}`}>
                  {a.status}
                </span>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <div className="text-xs text-gray-500 mb-1">Incoming from {a.trigger_sender}:</div>
                <div className="text-sm text-gray-700">{a.trigger_message_text}</div>
              </div>

              {editingId === a.id ? (
                <div className="mb-3">
                  <label className="text-xs text-gray-500 mb-1 block">Edit reply:</label>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleEditSend(a.id)} className="bg-whatsapp text-white px-4 py-1 rounded-lg text-sm">Send Edited</button>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="bg-whatsapp-light/30 rounded-lg p-3 mb-3">
                  <div className="text-xs text-gray-500 mb-1">Draft reply:</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{a.final_reply || a.draft_reply}</div>
                </div>
              )}

              {a.status === 'pending' && editingId !== a.id && (
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(a.id)} className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Approve & Send
                  </button>
                  <button onClick={() => handleEdit(a)} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Edit
                  </button>
                  <button onClick={() => handleReject(a.id)} className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
