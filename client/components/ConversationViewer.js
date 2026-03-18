const ConversationViewer = ({ agent, onBack }) => {
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [inputText, setInputText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const isFirstLoad = React.useRef(true);
  const containerRef = React.useRef(null);
  const latestTimestamp = React.useRef(null);

  const fetchMessages = async (incremental) => {
    if (!incremental) setLoading(true);
    try {
      let url = `/api/chats/${encodeURIComponent(agent.target_jid)}/messages?limit=50`;
      if (incremental && latestTimestamp.current) {
        url += `&after=${encodeURIComponent(latestTimestamp.current)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      const sorted = Array.isArray(data) ? data.reverse() : [];

      if (sorted.length > 0) {
        const newest = sorted[sorted.length - 1];
        if (newest.timestamp) latestTimestamp.current = newest.timestamp;
      }

      if (incremental) {
        if (sorted.length > 0) setMessages(prev => [...prev, ...sorted]);
      } else {
        setMessages(sorted);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    isFirstLoad.current = true;
    latestTimestamp.current = null;
    fetchMessages(false);
    const interval = setInterval(() => fetchMessages(true), 5000);
    return () => clearInterval(interval);
  }, [agent.target_jid]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || messages.length === 0) return;
    const scrollToBottom = (smooth) => {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      });
    };
    if (isFirstLoad.current) {
      scrollToBottom(false);
      isFirstLoad.current = false;
    } else {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (isNearBottom) scrollToBottom(true);
    }
  }, [messages]);

  // Generate AI reply using the agent's LLM + personality, then fill the input box
  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/generate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.reply) {
        setInputText(data.reply);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error('Failed to generate:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Send the message (either manually typed or AI-generated after review)
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(agent.target_jid)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        setInputText('');
        setMessages(prev => [...prev, {
          id: 'sent-' + Date.now(),
          content: text,
          is_from_me: true,
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      console.error('Failed to send:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fade-in flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onBack} className="text-whatsapp-dark hover:underline text-sm">&larr; Back</button>
        <h2 className="text-xl font-bold text-gray-800">{agent.target_name || agent.target_jid}</h2>
        <span className="text-sm text-gray-500">via {agent.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full text-white ${
          agent.auto_reply_mode === 'full' ? 'mode-badge-full' :
          agent.auto_reply_mode === 'semi' ? 'mode-badge-semi' : 'mode-badge-off'
        }`}>
          {agent.auto_reply_mode === 'full' ? 'Full-Auto' :
           agent.auto_reply_mode === 'semi' ? 'Semi-Auto' : 'Off'}
        </span>
      </div>

      <div ref={containerRef} className="bg-[#E5DDD5] rounded-t-xl p-4 flex-1 overflow-y-auto">
        {loading && messages.length === 0 ? (
          <p className="text-center text-gray-500 mt-12">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-500 mt-12">No messages found</p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] px-3 py-2 shadow-sm text-sm ${msg.is_from_me ? 'chat-bubble-out' : 'chat-bubble-in'}`}>
                  {!msg.is_from_me && msg.sender && (
                    <div className="text-xs font-semibold text-whatsapp-dark mb-1">{msg.sender}</div>
                  )}
                  {msg.media_type === 'image' && (
                    <img
                      src={`/api/chats/media/${encodeURIComponent(msg.chat_jid)}/${encodeURIComponent(msg.id)}`}
                      alt="Image"
                      className="rounded-lg mb-1 max-w-full max-h-64 cursor-pointer"
                      loading="lazy"
                      onClick={(e) => window.open(e.target.src, '_blank')}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  {msg.content && <div className="text-gray-800 whitespace-pre-wrap">{msg.content}</div>}
                  <div className="text-[10px] text-gray-400 text-right mt-1">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input: Generate AI draft → review/edit → Send */}
      <div className="bg-[#F0F0F0] rounded-b-xl px-3 py-2 flex items-end gap-2 border-t">
        <button
          onClick={handleGenerate}
          disabled={generating}
          title="Generate AI reply using agent personality"
          className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            generating ? 'bg-purple-300 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
          }`}
        >
          {generating ? 'Generating...' : 'AI Draft'}
        </button>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={generating ? 'Generating AI reply...' : 'AI-generated reply appears here — review, edit, then send'}
          rows={1}
          className="flex-1 px-3 py-2 rounded-lg border-0 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-whatsapp"
          style={{ maxHeight: '120px', minHeight: '40px' }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !inputText.trim()}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            sending || !inputText.trim()
              ? 'bg-gray-300 text-gray-500'
              : 'bg-whatsapp hover:bg-whatsapp-dark text-white'
          }`}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};
