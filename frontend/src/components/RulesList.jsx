import React from 'react'

export default function RulesList({ rules }) {
  if (!rules || rules.length === 0) {
    return <div className="text-sm text-gray-400">No rules created in this session.</div>
  }
  return (
    <div className="space-y-3">
      {rules.map((r) => (
        <div key={r._id || r.id || Math.random()} className="border-b border-gray-700 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-400">Keyword:</div>
              <div className="font-medium">{r.keyword}</div>

              <div className="text-sm text-gray-400 mt-2">DM:</div>
              <div className="text-sm text-gray-200">{r.dm_message}</div>
            </div>
            <div className="text-xs text-gray-400">Rule ID: <div className="break-words">{r._id || r.id || '—'}</div></div>
          </div>
        </div>
      ))}
    </div>
  )
}
