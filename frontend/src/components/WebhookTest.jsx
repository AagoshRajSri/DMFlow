import React from "react";

export default function WebhookTest() {
  const form = {
    event_id: "frontend-test-001",
    comment_id: "frontend-comment-001",
    user_id: "frontend-user-001",
    username: "testuser",
    comment_text: "hello",
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="card">
        <div className="text-xs text-gray-400">Sample webhook payload (read-only)</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-gray-400">Event ID</label>
            <input className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1" defaultValue={form.event_id} disabled />
          </div>
          <div>
            <label className="text-gray-400">Comment ID</label>
            <input className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1" defaultValue={form.comment_id} disabled />
          </div>
          <div>
            <label className="text-gray-400">User ID</label>
            <input className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1" defaultValue={form.user_id} disabled />
          </div>
          <div>
            <label className="text-gray-400">Username</label>
            <input className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1" defaultValue={form.username} disabled />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-gray-400">Comment Text</label>
          <textarea className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1 h-20" defaultValue={form.comment_text} disabled />
        </div>
      </div>

      <div className="text-xs text-gray-400">Webhook testing requires a valid server-side signature. Use the backend/Postman flow for signed webhook testing.</div>
    </div>
  );
}
