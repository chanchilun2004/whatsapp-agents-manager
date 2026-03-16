const Header = ({ currentPage, setCurrentPage, pendingCount, mcpConnected }) => {
  const navItems = [
    { id: 'agents', label: 'Agents' },
    { id: 'approvals', label: 'Approvals', badge: pendingCount },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <header className="bg-whatsapp-dark text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">WhatsApp Agents Manager</h1>
          <span className={`inline-block w-2 h-2 rounded-full ${mcpConnected ? 'bg-green-300' : 'bg-red-400'}`}
                title={mcpConnected ? 'MCP Connected' : 'MCP Disconnected'}></span>
        </div>
        <nav className="flex gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative
                ${currentPage === item.id
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            >
              {item.label}
              {item.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
