import React from "react";

function Stat({ emoji, title, value, loading }) {
  return (
    <div className={`relative bg-[#121212] border border-[#262626] rounded-2xl p-5 transition-all duration-300 hover:border-[#404040]`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg bg-[#262626] p-2 rounded-xl">{emoji}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</span>
      </div>
      <div className="text-3xl font-black text-white tracking-tight pl-1">
        {loading ? <span className="animate-pulse text-gray-600">—</span> : value}
      </div>
    </div>
  );
}

export default function Stats({ stats, loading }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4 px-1 text-white">Insights Overview</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat emoji="🚀" title="Sent DMs" value={stats.sent ?? 0} loading={loading} />
        <Stat emoji="⏳" title="Queued" value={stats.queued ?? 0} loading={loading} />
        <Stat emoji="⚠️" title="Failed" value={stats.failed ?? 0} loading={loading} />
        <Stat emoji="🛡️" title="Spam Blocked" value={stats.duplicates_blocked ?? 0} loading={loading} />
      </div>
    </div>
  );
}
