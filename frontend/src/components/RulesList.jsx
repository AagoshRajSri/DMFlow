import React from "react";

export default function RulesList({ rules }) {
  if (!rules || rules.length === 0) {
    return (
      <div className="text-sm font-medium text-gray-500 bg-[#121212] p-8 rounded-3xl border border-dashed border-[#262626] text-center">
        No active automations. Create one above to get started.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rules.map((r) => (
        <div key={r._id || r.id || Math.random()} className="bg-[#121212] border border-[#262626] rounded-3xl p-5 flex flex-col hover:border-[#404040] transition-colors shadow-lg">
          <div className="flex items-center justify-between mb-4">
             <div className="bg-pink-500/10 text-pink-500 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full border border-pink-500/20">
               "{r.keyword}"
             </div>
             <div className="text-[10px] text-gray-600 font-mono font-bold uppercase">
               ID: {r._id || r.id || "local"}
             </div>
          </div>
          <div className="bg-[#000000] rounded-2xl p-4 text-sm text-gray-300 font-medium flex-1 border border-[#262626] relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1.5 h-full ig-gradient"></div>
             "{r.dm_message}"
          </div>
        </div>
      ))}
    </div>
  );
}
