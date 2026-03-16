const SettingsPage = () => {
  const [settings, setSettings] = React.useState({});
  const [form, setForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
      setForm({
        mcp_sse_url: data.mcp_sse_url || '',
        openai_api_key: '',
        gemini_api_key: '',
        polling_interval_ms: data.polling_interval_ms || '60000',
      });
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  React.useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = { ...form };
      // Don't send empty API keys (preserves existing)
      if (!payload.openai_api_key) delete payload.openai_api_key;
      if (!payload.gemini_api_key) delete payload.gemini_api_key;

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await res.json();
      setMessage('Settings saved successfully');
      fetchSettings();
    } catch (err) {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Settings</h2>

      <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">MCP Server URL (SSE)</label>
          <input
            type="url"
            value={form.mcp_sse_url || ''}
            onChange={e => setForm(prev => ({ ...prev, mcp_sse_url: e.target.value }))}
            placeholder="https://alanworkphone.zeabur.app/sse"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
          />
          <p className="text-xs text-gray-400 mt-1">Your WhatsApp MCP server endpoint</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
          <input
            type="password"
            value={form.openai_api_key || ''}
            onChange={e => setForm(prev => ({ ...prev, openai_api_key: e.target.value }))}
            placeholder={settings.openai_api_key ? `Current: ${settings.openai_api_key}` : 'sk-...'}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
          />
          <p className="text-xs text-gray-400 mt-1">Leave blank to keep existing key</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Google Gemini API Key</label>
          <input
            type="password"
            value={form.gemini_api_key || ''}
            onChange={e => setForm(prev => ({ ...prev, gemini_api_key: e.target.value }))}
            placeholder={settings.gemini_api_key ? `Current: ${settings.gemini_api_key}` : 'AIza...'}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
          />
          <p className="text-xs text-gray-400 mt-1">Leave blank to keep existing key</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Polling Interval (ms)</label>
          <input
            type="number"
            value={form.polling_interval_ms || '60000'}
            onChange={e => setForm(prev => ({ ...prev, polling_interval_ms: e.target.value }))}
            min="10000"
            step="5000"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
          />
          <p className="text-xs text-gray-400 mt-1">Safety-net polling (webhook is primary). Default: 60000 (60s)</p>
        </div>

        {message && (
          <div className={`text-sm py-2 px-3 rounded-lg ${message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      <div className="mt-6 bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-800 mb-3">Webhook Setup</h3>
        <p className="text-sm text-gray-600 mb-2">
          Configure your WhatsApp bridge to send webhooks to this URL:
        </p>
        <code className="block bg-gray-100 px-3 py-2 rounded text-sm text-gray-800">
          WEBHOOK_URL=http://YOUR_SERVER_IP:3000/webhook/message
        </code>
        <p className="text-xs text-gray-400 mt-2">
          Set this as an environment variable on your Zeabur deployment of whatsapp-mcp.
        </p>
      </div>
    </div>
  );
};
