const RemindersPage = () => {
  const [reminders, setReminders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('active');
  const [scanning, setScanning] = React.useState(false);
  const [scanResult, setScanResult] = React.useState(null);
  const [sendingId, setSendingId] = React.useState(null);

  const typeColors = {
    meeting: 'bg-blue-100 text-blue-700',
    deadline: 'bg-red-100 text-red-700',
    follow_up: 'bg-orange-100 text-orange-700',
    task: 'bg-purple-100 text-purple-700',
    unanswered: 'bg-yellow-100 text-yellow-700',
    other: 'bg-gray-100 text-gray-700',
  };

  const urgencyBorder = {
    high: 'border-l-4 border-l-red-500',
    normal: '',
    low: 'border-l-4 border-l-gray-300',
  };

  const fetchReminders = async () => {
    try {
      const res = await fetch(`/api/reminders?status=${filter}`);
      const data = await res.json();
      setReminders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load reminders:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchReminders();
  }, [filter]);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/reminders/scan', { method: 'POST' });
      const data = await res.json();
      setScanResult(data);
      fetchReminders();
    } catch (err) {
      console.error('Scan failed:', err);
      setScanResult({ error: 'Scan failed' });
    } finally {
      setScanning(false);
    }
  };

  const handleSend = async (id) => {
    setSendingId(id);
    try {
      const res = await fetch(`/api/reminders/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchReminders();
      } else {
        alert(data.error || 'Failed to send');
      }
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSendingId(null);
    }
  };

  const handleDismiss = async (id) => {
    await fetch(`/api/reminders/${id}/dismiss`, { method: 'POST' });
    fetchReminders();
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Chat Reminders</h2>
        <div className="flex items-center gap-3">
          {scanResult && !scanResult.error && (
            <span className="text-sm text-gray-500">
              Scanned {scanResult.chats_scanned} chats, found {scanResult.reminders_found} items
            </span>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              scanning
                ? 'bg-purple-300 text-white'
                : 'bg-purple-500 hover:bg-purple-600 text-white'
            }`}
          >
            {scanning ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block"></span>
                Scanning chats...
              </span>
            ) : 'Scan Chats'}
          </button>
        </div>
      </div>

      {scanning && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
          <div>
            <div className="text-sm font-medium text-purple-700">Analyzing recent messages with AI...</div>
            <div className="text-xs text-purple-500">This may take 30-60 seconds depending on the number of chats</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {['active', 'sent', 'dismissed'].map(s => (
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

      {loading && reminders.length === 0 ? (
        <p className="text-center text-gray-500 py-12">Loading...</p>
      ) : reminders.length === 0 && !scanning ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No {filter} reminders</p>
          {filter === 'active' && <p>Click "Scan Chats" to analyze recent messages for important items.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map(r => (
            <div key={r.id} className={`bg-white rounded-xl shadow-sm border p-4 fade-in ${urgencyBorder[r.urgency] || ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[r.reminder_type] || typeColors.other}`}>
                    {r.reminder_type.replace('_', ' ')}
                  </span>
                  {r.urgency === 'high' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Urgent</span>
                  )}
                  <span className="text-xs text-gray-400">{r.chat_name}</span>
                </div>
                <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
              </div>

              <div className="font-medium text-gray-800 mb-2">{r.summary}</div>

              <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
                <div className="text-xs text-gray-500 mb-1">From {r.message_sender}:</div>
                <div className="text-gray-700 whitespace-pre-wrap">{r.message_text}</div>
              </div>

              {r.status === 'active' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSend(r.id)}
                    disabled={sendingId === r.id}
                    className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    {sendingId === r.id ? 'Sending...' : 'Send Reminder'}
                  </button>
                  <button
                    onClick={() => handleDismiss(r.id)}
                    className="text-gray-500 hover:text-gray-700 px-4 py-1.5 rounded-lg text-sm transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {r.status === 'sent' && (
                <div className="text-xs text-green-600">Sent to {r.sent_to} at {formatDate(r.sent_at)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
