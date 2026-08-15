import React from "react";

export default function RulesList({ rules }) {
  if (!rules || rules.length === 0) {
    return (
      <div className="text-sm text-gray-400">
        No rules created in this session.
      </div>
    );
  }
  return (
    <div className="dm-list">
      {rules.map((r) => (
        <div key={r._id || r.id || Math.random()} className="dm-item">
          <div className="dm-avatar">R</div>
          <div>
            <div className="dm-bubble">
              <div className="text-sm text-gray-400">Keyword</div>
              <div className="font-medium">{r.keyword}</div>
            </div>
            <div className="dm-bubble me mt-2">{r.dm_message}</div>
            <div className="text-xs text-gray-400 mt-1">ID: <span className="break-words">{r._id || r.id || "—"}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}
