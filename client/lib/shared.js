// Shared constants and utilities used across multiple components.
// Loaded as a plain script before components (no module bundler).

const STAGE_COLORS = {
  lead: '#6B7280', qualified: '#3B82F6', proposal: '#7C3AED', negotiation: '#F59E0B',
  closed_won: '#10B981', closed_lost: '#EF4444',
  onboarding: '#3B82F6', active: '#10B981', at_risk: '#F59E0B', churned: '#EF4444', renewal: '#7C3AED',
};

const MODE_LABELS = { off: 'Manual', semi: 'Semi-Auto', full: 'Full-Auto' };
const MODE_COLORS = { off: 'bg-gray-400', semi: 'bg-amber-400', full: 'bg-emerald-400' };
const ROLE_LABELS = { general: 'General', sales: 'Sales', customer_success: 'CS' };

function parseJsonSafe(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch { return []; }
}

function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

const AVATAR_COLORS = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
