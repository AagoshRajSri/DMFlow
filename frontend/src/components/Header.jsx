import React from "react";

export default function Header({ online, fetchHealth }) {
  return (
    <header className="flex items-center justify-between mb-8 pb-6 border-b border-gray-800">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold text-xl">
          DF
        </div>
        <div>
          <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            DMFlow
          </div>
          <div className="text-xs font-medium uppercase tracking-widest text-indigo-400 mt-1">
            Automations • DMs • Replies
          </div>
        </div>
      </div>

      <div className="flex items-center bg-gray-900/50 rounded-full border border-gray-800 p-1.5 pr-4 backdrop-blur-sm">
        <button
          onClick={fetchHealth}
          className="text-xs font-medium px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-full transition-colors mr-3"
        >
          Check
        </button>
        <div className="flex items-center space-x-2">
          <span className="relative flex h-3 w-3">
            {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${online ? "bg-emerald-500" : "bg-red-500"}`}></span>
          </span>
          <span className="text-xs font-semibold text-gray-300">
            {online ? "Backend Online" : "Backend Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
