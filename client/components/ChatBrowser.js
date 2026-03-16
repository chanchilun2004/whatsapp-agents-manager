const ChatBrowser = ({ onSelect, selectedJid }) => {
  const [chats, setChats] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const fetchChats = async (searchQuery) => {
    setLoading(true);
    try {
      const url = searchQuery
        ? `/api/chats/search?q=${encodeURIComponent(searchQuery)}`
        : '/api/chats?limit=30';
      const res = await fetch(url);
      const data = await res.json();
      setChats(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchChats('');
  }, []);

  const handleSearch = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(window._chatSearchTimeout);
    window._chatSearchTimeout = setTimeout(() => fetchChats(val), 300);
  };

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={handleSearch}
        placeholder="Search chats..."
        className="w-full px-3 py-2 border rounded-lg mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-whatsapp"
      />
      <div className="max-h-48 overflow-y-auto border rounded-lg">
        {loading ? (
          <p className="text-center py-4 text-gray-400 text-sm">Loading...</p>
        ) : chats.length === 0 ? (
          <p className="text-center py-4 text-gray-400 text-sm">No chats found</p>
        ) : (
          chats.map(chat => (
            <button
              key={chat.jid || chat.chat_jid}
              onClick={() => onSelect(chat)}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 text-sm transition-colors
                ${selectedJid === (chat.jid || chat.chat_jid) ? 'bg-whatsapp/10 border-l-2 border-l-whatsapp' : ''}`}
            >
              <div className="font-medium text-gray-800">{chat.name || chat.jid || chat.chat_jid}</div>
              {chat.last_message && (
                <div className="text-xs text-gray-400 truncate">{chat.last_message}</div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
