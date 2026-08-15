import React from 'react'

function Card({ title, value, loading }) {
  return (
    <div className="card flex flex-col">
      <div className="text-sm text-gray-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{loading ? '—' : value}</div>
    </div>
  )
}

export default function Stats({ stats, loading }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card title="Sent" value={stats.sent ?? 0} loading={loading} />
      <Card title="Queued" value={stats.queued ?? 0} loading={loading} />
      <Card title="Failed" value={stats.failed ?? 0} loading={loading} />
      <Card title="Duplicates" value={stats.duplicates_blocked ?? 0} loading={loading} />
    </div>
  )
}
