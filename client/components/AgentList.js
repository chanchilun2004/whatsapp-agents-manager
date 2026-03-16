const AgentList = ({ agents, onEdit, onToggle, onDelete, onViewConversation, onCreate }) => {
  const modeColors = { off: 'mode-badge-off', semi: 'mode-badge-semi', full: 'mode-badge-full' };
  const modeLabels = { off: 'Off', semi: 'Semi-Auto', full: 'Full-Auto' };
  const providerLabels = { openai: 'OpenAI', gemini: 'Gemini' };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Agents</h2>
        <button
          onClick={onCreate}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + New Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No agents yet</p>
          <p>Create your first agent to start auto-replying to WhatsApp messages.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => (
            <div key={agent.id} className={`bg-white rounded-xl shadow-sm border p-5 fade-in ${!agent.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-lg text-gray-800">{agent.name}</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!agent.is_active}
                    onChange={() => onToggle(agent.id)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-whatsapp after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>

              <p className="text-sm text-gray-500 mb-3 truncate" title={agent.target_name || agent.target_jid}>
                {agent.target_name || agent.target_jid}
              </p>

              <div className="flex gap-2 mb-4">
                <span className={`${modeColors[agent.auto_reply_mode]} text-white text-xs px-2 py-1 rounded-full`}>
                  {modeLabels[agent.auto_reply_mode]}
                </span>
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {providerLabels[agent.llm_provider]} / {agent.llm_model}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-4 line-clamp-2">{agent.system_prompt}</p>

              <div className="flex gap-2">
                <button onClick={() => onViewConversation(agent)} className="text-sm text-whatsapp-dark hover:underline">
                  View Chat
                </button>
                <button onClick={() => onEdit(agent)} className="text-sm text-blue-600 hover:underline">
                  Edit
                </button>
                <button onClick={() => onDelete(agent.id)} className="text-sm text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
