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
    ...(agent || {}),
  });
  const [saving, setSaving] = React.useState(false);

  const models = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'],
    gemini: ['gemini-2.0-flash', 'gemini-2.5-pro-preview-05-06', 'gemini-2.5-flash-preview-04-17', 'gemini-3.0-pro'],
  };

  const handleChange = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Reset model when provider changes
      if (field === 'llm_provider') {
        next.llm_model = models[value][0];
      }
      return next;
    });
  };

  const handleChatSelect = (chat) => {
    handleChange('target_jid', chat.jid || chat.chat_jid);
    handleChange('target_name', chat.name || '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6 max-w-2xl mx-auto fade-in">
      <h2 className="text-xl font-bold mb-4">{agent ? 'Edit Agent' : 'Create Agent'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => handleChange('name', e.target.value)}
            required
            placeholder="e.g. Sales Assistant"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt (Personality)</label>
          <textarea
            value={form.system_prompt}
            onChange={e => handleChange('system_prompt', e.target.value)}
            required
            rows={5}
            placeholder="You are a helpful sales assistant for our business. Be polite, professional, and respond in the customer's language..."
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target WhatsApp Chat</label>
          {form.target_jid && (
            <div className="mb-2 text-sm text-gray-600">
              Selected: <span className="font-medium">{form.target_name || form.target_jid}</span>
            </div>
          )}
          <ChatBrowser onSelect={handleChatSelect} selectedJid={form.target_jid} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LLM Provider</label>
            <select
              value={form.llm_provider}
              onChange={e => handleChange('llm_provider', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select
              value={form.llm_model}
              onChange={e => handleChange('llm_model', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-whatsapp"
            >
              {models[form.llm_provider].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Reply Mode</label>
          <div className="flex gap-4">
            {[
              { value: 'off', label: 'Off', desc: 'No auto-reply' },
              { value: 'semi', label: 'Semi-Auto', desc: 'Drafts for approval' },
              { value: 'full', label: 'Full-Auto', desc: 'Sends automatically' },
            ].map(opt => (
              <label key={opt.value} className={`flex-1 border rounded-lg p-3 cursor-pointer transition-colors text-center
                ${form.auto_reply_mode === opt.value ? 'border-whatsapp bg-whatsapp/5' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="auto_reply_mode"
                  value={opt.value}
                  checked={form.auto_reply_mode === opt.value}
                  onChange={e => handleChange('auto_reply_mode', e.target.value)}
                  className="sr-only"
                />
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
          <input
            type="range"
            min="5"
            max="50"
            value={form.context_message_count}
            onChange={e => handleChange('context_message_count', parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>5</span><span>50</span>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-whatsapp hover:bg-whatsapp-dark text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : (agent ? 'Update Agent' : 'Create Agent')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
