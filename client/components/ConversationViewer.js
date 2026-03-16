const ConversationViewer = ({ agent, onBack }) => {
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const bottomRef = React.useRef(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(agent.target_jid)}/messages?limit=50`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data.reverse() : []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [agent.target_jid]);

  React.useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fade-in">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-whatsapp-dark hover:underline text-sm">&larr; Back</button>
        <h2 className="text-xl font-bold text-gray-800">
          {agent.target_name || agent.target_jid}
        </h2>
        <span className="text-sm text-gray-500">via {agent.name}</span>
      </div>

      <div className="bg-[#E5DDD5] rounded-xl p-4 h-[500px] overflow-y-auto">
        {loading ? (
          <p className="text-center text-gray-500 mt-12">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-500 mt-12">No messages found</p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] px-3 py-2 shadow-sm text-sm ${msg.is_from_me ? 'chat-bubble-out' : 'chat-bubble-in'}`}>
                  {!msg.is_from_me && msg.sender && (
                    <div className="text-xs font-semibold text-whatsapp-dark mb-1">{msg.sender}</div>
                  )}
                  <div className="text-gray-800 whitespace-pre-wrap">{msg.content}</div>
                  <div className="text-[10px] text-gray-400 text-right mt-1">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            ))}
            <div ref={bottomRef}></div>
          </div>
        )}
      </div>
    </div>
  );
};
