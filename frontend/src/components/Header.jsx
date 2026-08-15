import React from "react";

export default function Header({ online, fetchHealth }) {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">DMFlow</h1>
        <p className="text-sm text-gray-400">Comment → Match → DM</p>
      </div>

      <div className="flex items-center space-x-3">
        <button
          onClick={fetchHealth}
          className="text-sm px-3 py-1 bg-gray-800 border border-gray-700 rounded-md"
        >
          Check
        </button>
        <div className="flex items-center space-x-2">
          <span
            className={`w-3 h-3 rounded-full ${online ? "bg-emerald-400" : "bg-red-500"}`}
            aria-hidden
          />
          <span className="text-sm text-gray-300">
            {online ? "Backend Online" : "Backend Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
