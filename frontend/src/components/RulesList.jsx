import React from "react";

export default function RulesList({ rules }) {
  if (!rules || rules.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic bg-gray-900/30 p-6 rounded-xl border border-dashed border-gray-800 text-center">
        No rules created in this session. Create one above to see it here!
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rules.map((r) => (
        <div key={r._id || r.id || Math.random()} className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 flex flex-col hover:border-gray-700 transition-colors">
          <div className="flex items-center justify-between mb-3">
             <div className="bg-indigo-500/20 text-indigo-400 text-xs font-bold px-3 py-1 rounded-full border border-indigo-500/30">
               "{r.keyword}"
             </div>
             <div className="text-[10px] text-gray-500 font-mono">
               ID: {r._id || r.id || "local"}
             </div>
          </div>
          <div className="bg-black/40 rounded-xl p-3 text-sm text-gray-300 flex-1 border border-gray-800/50 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
             "{r.dm_message}"
          </div>
        </div>
      ))}
    </div>
  );
}
