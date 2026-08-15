import React from "react";

function Stat({ emoji, title, value, loading, colorClass }) {
  return (
    <div className={`relative overflow-hidden bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-2xl p-4 transition-all duration-300 hover:border-gray-600 hover:shadow-lg hover:-translate-y-1 group`}>
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-150 ${colorClass}`}></div>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2">
        <span className="text-sm bg-gray-800/80 p-1.5 rounded-lg">{emoji}</span>
        <span className="tracking-wide uppercase">{title}</span>
      </div>
      <div className="text-3xl font-bold text-white tracking-tight">
        {loading ? <span className="animate-pulse">—</span> : value}
      </div>
    </div>
  );
}

export default function Stats({ stats, loading }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Stat emoji="✉️" title="Sent" value={stats.sent ?? 0} loading={loading} colorClass="bg-emerald-500" />
      <Stat
        emoji="🕒"
        title="Queued"
        value={stats.queued ?? 0}
        loading={loading}
        colorClass="bg-blue-500"
      />
      <Stat
        emoji="❗"
        title="Failed"
        value={stats.failed ?? 0}
        loading={loading}
        colorClass="bg-red-500"
      />
      <Stat
        emoji="🔁"
        title="Duplicates"
        value={stats.duplicates_blocked ?? 0}
        loading={loading}
        colorClass="bg-purple-500"
      />
    </div>
  );
}
