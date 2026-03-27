const ConversationViewer = ({ agent, chatJid, chatNameProp, onBack, lastWsMessage, lastStageUpdate }) => {
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [inputText, setInputText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [stageInfo, setStageInfo] = React.useState(null);
  const [latestSummary, setLatestSummary] = React.useState(null);
  const [showPanel, setShowPanel] = React.useState(false);
  const [detectingStage, setDetectingStage] = React.useState(false);
  const [generatingSummary, setGeneratingSummary] = React.useState(false);
  const [chatName, setChatName] = React.useState('');
  const [senderNames, setSenderNames] = React.useState({});
  const isFirstLoad = React.useRef(true);
  const containerRef = React.useRef(null);
  const latestTimestamp = React.useRef(null);
  const resolvedSenders = React.useRef(new Set());

  const targetJid = chatJid || agent.target_jid;
  const isRoleAgent = agent.role && agent.role !== 'general';

  React.useEffect(() => {
    if (chatNameProp) { setChatName(chatNameProp); return; }
    if (!targetJid) return;
    fetch(`/api/chats/${encodeURIComponent(targetJid)}`)
      .then(r => r.json())
      .then(data => setChatName(data?.name || targetJid))
      .catch(() => setChatName(targetJid));
  }, [targetJid, chatNameProp]);

  const fetchMessages = async (incremental) => {
    if (!incremental) setLoading(true);
    try {
      let url = `/api/chats/${encodeURIComponent(targetJid)}/messages?limit=50`;
      if (incremental && latestTimestamp.current) url += `&after=${encodeURIComponent(latestTimestamp.current)}`;
      const res = await fetch(url);
      const data = await res.json();
      const sorted = Array.isArray(data) ? data.reverse() : [];
      if (sorted.length > 0) {
        const newest = sorted[sorted.length - 1];
        if (newest.timestamp) latestTimestamp.current = newest.timestamp;
      }
      if (incremental) {
        if (sorted.length > 0) setMessages(prev => {
          // Filter out messages already added by WebSocket
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = sorted.filter(m => !existingIds.has(m.id));
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
      } else setMessages(sorted);
    } catch (err) { console.error('Failed to load messages:', err); }
    finally { setLoading(false); }
  };

  const fetchStageInfo = async () => {
    if (!isRoleAgent) return;
    try {
      const res = await fetch(`/api/pipeline/${agent.id}/stage`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const match = data.find(t => t.chat_jid === targetJid);
        if (match?.stage) setStageInfo(match.stage);
      }
    } catch {}
  };

  const fetchLatestSummary = async () => {
    if (!isRoleAgent) return;
    try {
      const res = await fetch(`/api/summaries?agent_id=${agent.id}&limit=5`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const match = data.find(s => s.chat_jid === targetJid);
        if (match) setLatestSummary(match);
      }
    } catch {}
  };

  // Update stage from WebSocket
  React.useEffect(() => {
    if (!lastStageUpdate || !lastStageUpdate._ts) return;
    if (lastStageUpdate.agent_id !== agent.id || lastStageUpdate.chat_jid !== targetJid) return;
    setStageInfo({ stage: lastStageUpdate.stage, confidence: lastStageUpdate.confidence, reasoning: lastStageUpdate.reasoning });
  }, [lastStageUpdate]);

  // Resolve sender names
  React.useEffect(() => {
    if (messages.length === 0) return;
    const unknownSenders = [...new Set(
      messages.filter(m => !m.is_from_me && m.sender && !resolvedSenders.current.has(m.sender))
        .map(m => m.sender)
    )];
    if (unknownSenders.length === 0) return;
    unknownSenders.forEach(s => resolvedSenders.current.add(s));
    fetch('/api/chats/resolve-senders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senders: unknownSenders }),
    })
      .then(r => r.json())
      .then(names => setSenderNames(prev => ({ ...prev, ...names })))
      .catch(() => {});
  }, [messages]);

  React.useEffect(() => {
    isFirstLoad.current = true;
    latestTimestamp.current = null;
    setSenderNames({}); resolvedSenders.current = new Set();
    setMessages([]); setStageInfo(null); setLatestSummary(null); setShowPanel(false); setInputText('');
    fetchMessages(false); fetchStageInfo(); fetchLatestSummary();
    const interval = setInterval(() => fetchMessages(true), 5000);
    return () => clearInterval(interval);
  }, [targetJid]);

  // Instant message from WebSocket (new_message + reply_sent)
  React.useEffect(() => {
    if (!lastWsMessage || !lastWsMessage._ts) return;
    const chatJidMatch = lastWsMessage.chat_jid;
    if (!chatJidMatch || chatJidMatch !== targetJid) return;

    // For reply_sent events, the content is in `reply` field
    const content = lastWsMessage.content || lastWsMessage.reply;
    if (!content) return;

    // Cache sender name from WebSocket push name
    if (lastWsMessage.sender && lastWsMessage.sender_name) {
      setSenderNames(prev => ({ ...prev, [lastWsMessage.sender]: lastWsMessage.sender_name }));
    }

    const id = lastWsMessage.id || ('ws-' + lastWsMessage._ts);
    setMessages(prev => {
      if (prev.some(m => m.id === id)) return prev;
      const newMsg = {
        id,
        content,
        sender: lastWsMessage.sender,
        is_from_me: lastWsMessage.is_from_me != null ? lastWsMessage.is_from_me : !!lastWsMessage.reply,
        timestamp: lastWsMessage.timestamp || new Date().toISOString(),
        media_type: lastWsMessage.media_type,
        chat_jid: chatJidMatch,
      };
      if (newMsg.timestamp) latestTimestamp.current = newMsg.timestamp;
      return [...prev, newMsg];
    });
  }, [lastWsMessage]);

  const prevMsgCount = React.useRef(0);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || messages.length === 0) return;
    const scrollToBottom = (smooth) => requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
    if (isFirstLoad.current) {
      scrollToBottom(false);
      isFirstLoad.current = false;
    } else if (messages.length > prevMsgCount.current) {
      // New message added — always scroll to bottom
      scrollToBottom(true);
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_jid: targetJid }),
      });
      const data = await res.json();
      if (data.reply) setInputText(data.reply);
      else if (data.error) alert(data.error);
    } catch (err) { console.error('Failed to generate:', err); }
    finally { setGenerating(false); }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(targetJid)}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        setInputText('');
        setMessages(prev => [...prev, { id: 'sent-' + Date.now(), content: text, is_from_me: true, timestamp: new Date().toISOString() }]);
      }
    } catch (err) { console.error('Failed to send:', err); }
    finally { setSending(false); }
  };

  const handleDetectStage = async () => {
    setDetectingStage(true);
    try {
      const res = await fetch(`/api/pipeline/${agent.id}/detect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_jid: targetJid }),
      });
      const data = await res.json();
      if (data.stage) setStageInfo(data);
    } catch (err) { console.error('Failed to detect stage:', err); }
    finally { setDetectingStage(false); }
  };

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const res = await fetch(`/api/summaries/generate/${agent.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.summaries?.length > 0) {
        const match = data.summaries.find(s => s.chat_jid === targetJid);
        if (match) setLatestSummary(match);
      }
    } catch (err) { console.error('Failed to generate summary:', err); }
    finally { setGeneratingSummary(false); }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const formatTime = formatTimestamp;

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="bg-white px-4 py-3 flex items-center gap-3 shrink-0 border-b border-gray-200">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">{(chatName || '?')[0].toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900 truncate">{chatName || targetJid}</div>
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                agent.auto_reply_mode === 'full' ? 'bg-emerald-400' :
                agent.auto_reply_mode === 'semi' ? 'bg-amber-400' : 'bg-gray-300'
              }`}></span>
              <span>{agent.name}</span>
              <span className="text-gray-300">·</span>
              <span>{agent.auto_reply_mode === 'full' ? 'Full-Auto' : agent.auto_reply_mode === 'semi' ? 'Semi-Auto' : 'Manual'}</span>
              {isRoleAgent && stageInfo && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] text-white font-medium" style={{ backgroundColor: STAGE_COLORS[stageInfo.stage] || '#6B7280' }}>
                    {(stageInfo.stage || '').replace('_', ' ')}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isRoleAgent && (
              <button
                onClick={() => setShowPanel(!showPanel)}
                className={`p-2 rounded-lg transition-colors ${showPanel ? 'bg-brand-50 text-brand-600' : 'hover:bg-gray-100 text-gray-400'}`}
                title="Contact details"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
          {loading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-gray-400">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Loading messages...
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">No messages found</div>
          ) : (
            <div className="space-y-3 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[65%] px-3.5 py-2 text-sm ${msg.is_from_me ? 'chat-bubble-out' : 'chat-bubble-in'}`}>
                    {!msg.is_from_me && msg.sender && (
                      <div className="text-xs font-semibold text-brand-600 mb-1">{senderNames[msg.sender] || msg.sender}</div>
                    )}
                    {msg.media_type === 'image' && (
                      <img
                        src={`/api/chats/media/${encodeURIComponent(msg.chat_jid)}/${encodeURIComponent(msg.id)}`}
                        alt="Image" className="rounded-lg mb-1 max-w-full max-h-64 cursor-pointer" loading="lazy"
                        onClick={(e) => window.open(e.target.src, '_blank')}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    {msg.content && <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.content}</div>}
                    <div className="text-[10px] text-gray-400 text-right mt-1">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="bg-white px-4 py-3 border-t border-gray-200 shrink-0">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <button
              onClick={handleGenerate}
              disabled={generating}
              title="Generate AI reply"
              className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                generating
                  ? 'bg-brand-200 text-brand-400 cursor-wait'
                  : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm hover:shadow-md'
              }`}
            >
              {generating ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              )}
            </button>
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={generating ? 'Generating AI reply...' : 'Type a message...'}
                rows={1}
                className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm resize-none focus:bg-white placeholder-gray-400 transition-colors"
                style={{ maxHeight: '120px', minHeight: '40px' }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={sending || !inputText.trim()}
              className={`shrink-0 p-2.5 rounded-xl transition-all ${
                sending || !inputText.trim()
                  ? 'bg-gray-100 text-gray-300'
                  : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm hover:shadow-md'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Right panel - Contact details */}
      {isRoleAgent && showPanel && (
        <div className="w-[300px] shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden fade-in">
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-gray-900">Contact Details</span>
            <button onClick={() => setShowPanel(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Contact card */}
          <div className="px-4 py-4 border-b border-gray-100 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center mx-auto mb-2">
              <span className="text-white text-xl font-bold">{(chatName || '?')[0].toUpperCase()}</span>
            </div>
            <div className="font-semibold text-gray-900">{chatName || targetJid}</div>
            <div className="text-xs text-gray-400 mt-0.5 truncate">{targetJid}</div>
          </div>

          {/* Details content */}
          <div className="flex-1 overflow-y-auto">
            {/* Stage section */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pipeline Stage</span>
                <button
                  onClick={handleDetectStage}
                  disabled={detectingStage}
                  className="text-[11px] text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                >
                  {detectingStage ? 'Detecting...' : 'Re-detect'}
                </button>
              </div>
              {stageInfo ? (
                <div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: STAGE_COLORS[stageInfo.stage] || '#6B7280' }}>
                    {(stageInfo.stage || '').replace('_', ' ')}
                  </span>
                  {stageInfo.confidence != null && (
                    <span className="text-xs text-gray-400 ml-2">{Math.round(stageInfo.confidence * 100)}% confidence</span>
                  )}
                  {stageInfo.reasoning && (
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">{stageInfo.reasoning}</p>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-400">Not yet detected</span>
              )}
            </div>

            {/* Summary section */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Summary</span>
                <button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="text-[11px] text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                >
                  {generatingSummary ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {latestSummary ? (
                <div>
                  <p className="text-xs text-gray-600 leading-relaxed">{latestSummary.summary}</p>
                  {(() => {
                    const followUps = parseJsonSafe(latestSummary.follow_ups);
                    return followUps.length > 0 && (
                      <div className="mt-3">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Follow-ups</span>
                        <div className="mt-1 space-y-1.5">
                          {followUps.map((f, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${
                                f.priority === 'high' ? 'bg-red-500' : f.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-400'
                              }`}>{f.priority}</span>
                              <div>
                                <span className="text-gray-700">{f.action}</span>
                                {f.due_hint && <span className="text-gray-400 ml-1">({f.due_hint})</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <span className="text-xs text-gray-400">No summary available</span>
              )}
            </div>

            {/* Agent info */}
            <div className="px-4 py-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</span>
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Name</span>
                  <span className="text-xs font-medium text-gray-700">{agent.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Role</span>
                  <span className="text-xs font-medium text-gray-700">{agent.role || 'General'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Mode</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full text-white ${
                    agent.auto_reply_mode === 'full' ? 'bg-emerald-500' :
                    agent.auto_reply_mode === 'semi' ? 'bg-amber-500' : 'bg-gray-400'
                  }`}>{agent.auto_reply_mode === 'full' ? 'Full-Auto' : agent.auto_reply_mode === 'semi' ? 'Semi-Auto' : 'Manual'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Model</span>
                  <span className="text-xs font-medium text-brand-600">{agent.llm_model}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
