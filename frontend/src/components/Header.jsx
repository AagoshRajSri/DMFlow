import React from "react";

export default function Header({ online, fetchHealth }) {
  return (
    <header className="flex items-center justify-between mb-8 pb-6 border-b border-gray-900/50">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl ig-gradient flex items-center justify-center shadow-lg shadow-pink-500/20 text-white font-black text-xl">
          DF
        </div>
        <div>
          <div className="text-2xl font-bold text-white tracking-tight">
            DMFlow <span className="font-normal text-gray-400 text-xl hidden sm:inline">Creator Studio</span>
          </div>
          <div className="text-xs font-semibold uppercase tracking-widest ig-gradient-text mt-1">
            Automations • DMs • Replies
          </div>
        </div>
      </div>

      <div className="flex items-center bg-[#121212] rounded-full border border-[#262626] p-1.5 pr-4">
        <button
          onClick={fetchHealth}
          className="text-xs font-bold px-4 py-2 bg-[#262626] hover:bg-[#363636] text-white rounded-full transition-colors mr-3 uppercase tracking-wide"
        >
          Check
        </button>
        <div className="flex items-center space-x-2">
          <span className="relative flex h-3 w-3">
            {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${online ? "bg-emerald-500" : "bg-red-500"}`}></span>
          </span>
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
            {online ? "System Online" : "System Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
