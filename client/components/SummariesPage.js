const SummariesPage = () => {
  const [summaries, setSummaries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [sendingDigest, setSendingDigest] = React.useState(false);
  const [message, setMessage] = React.useState(null);

  const fetchSummaries = async () => {
    try {
      const res = await fetch('/api/summaries?limit=50');
      const data = await res.json();
      setSummaries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load summaries:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchSummaries();
  }, []);

  const handleGenerateAll = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/summaries/generate-all', { method: 'POST' });
      const data = await res.json();
      setMessage({ type: 'success', text: `Generated ${data.count} summaries` });
      fetchSummaries();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to generate summaries' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDigest = async () => {
    setSendingDigest(true);
    setMessage(null);
    try {
      const res = await fetch('/api/summaries/digest', { method: 'POST' });
      const data = await res.json();
      if (data.sent) {
        setMessage({ type: 'success', text: `Daily digest sent (${data.summaries_count} clients)` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send digest' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to send digest' });
    } finally {
      setSendingDigest(false);
    }
  };

  const handleSendToWhatsApp = async (id) => {
    try {
      const res = await fetch(`/api/summaries/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (data.sent) {
        setMessage({ type: 'success', text: 'Summary sent to WhatsApp' });
        fetchSummaries();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to send' });
    }
  };

  const priorityColors = { high: 'text-red-600 font-semibold', normal: 'text-gray-700', low: 'text-gray-400' };
  const priorityBadge = { high: 'bg-red-100 text-red-700', normal: 'bg-gray-100 text-gray-600', low: 'bg-gray-50 text-gray-400' };

  const parseJson = (str) => {
    if (!str) return [];
    if (Array.isArray(str)) return str;
    try { return JSON.parse(str); } catch { return []; }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Client Summaries</h2>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              generating ? 'bg-purple-300 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
            }`}
          >
            {generating ? 'Generating...' : 'Generate All Summaries'}
          </button>
          <button
            onClick={handleDigest}
            disabled={sendingDigest}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sendingDigest ? 'bg-whatsapp/50 text-white' : 'bg-whatsapp hover:bg-whatsapp-dark text-white'
            }`}
          >
            {sendingDigest ? 'Sending...' : 'Send Daily Digest'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading summaries...</div>
      ) : summaries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No summaries yet</p>
          <p>Click "Generate All Summaries" to analyze your client conversations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {summaries.map(summary => {
            const needs = parseJson(summary.needs);
            const blockers = parseJson(summary.blockers);
            const followUps = parseJson(summary.follow_ups);

            return (
              <div key={summary.id} className="bg-white rounded-xl shadow-sm border p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">{summary.chat_name || summary.chat_jid}</h3>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-gray-500">Agent: {summary.agent_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        summary.agent_role === 'sales' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {summary.agent_role === 'sales' ? 'Sales' : 'CS'}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">{formatTime(summary.created_at)}</div>
                </div>

                <p className="text-sm text-gray-700 mb-3">{summary.summary}</p>

                {needs.length > 0 && (
                  <div className="mb-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Needs</h4>
                    <ul className="text-sm text-gray-600 space-y-0.5">
                      {needs.map((n, i) => <li key={i} className="pl-3 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:bg-blue-400 before:rounded-full">{n}</li>)}
                    </ul>
                  </div>
                )}

                {blockers.length > 0 && (
                  <div className="mb-2 bg-red-50 rounded-lg px-3 py-2">
                    <h4 className="text-xs font-semibold text-red-600 uppercase mb-1">Blockers</h4>
                    <ul className="text-sm text-red-700 space-y-0.5">
                      {blockers.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}

                {followUps.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Follow-ups</h4>
                    <div className="space-y-1">
                      {followUps.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${priorityBadge[f.priority] || priorityBadge.normal}`}>
                            {(f.priority || 'normal').toUpperCase()}
                          </span>
                          <span className={priorityColors[f.priority] || priorityColors.normal}>{f.action}</span>
                          {f.due_hint && <span className="text-xs text-gray-400">({f.due_hint})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2 border-t">
                  {summary.sent_to ? (
                    <span className="text-xs text-green-600">Sent to {summary.sent_to} on {formatTime(summary.sent_at)}</span>
                  ) : (
                    <button
                      onClick={() => handleSendToWhatsApp(summary.id)}
                      className="text-xs text-whatsapp-dark hover:underline"
                    >
                      Send to WhatsApp
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
