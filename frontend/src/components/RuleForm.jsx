import React, { useState } from "react";
import axios from "axios";

export default function RuleForm({ base, onSuccess }) {
  const [keyword, setKeyword] = useState("");
  const [dm, setDm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!keyword.trim() || !dm.trim()) {
      setMessage({
        type: "error",
        text: "Keyword and DM message are required.",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${base}/rules`, {
        keyword: keyword.trim(),
        dm_message: dm.trim(),
      });
      setMessage({ type: "success", text: "Rule created." });
      setKeyword("");
      setDm("");
      if (onSuccess) onSuccess(res.data);
    } catch (err) {
      setMessage({ type: "error", text: "Failed to create rule. Try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm text-gray-300">Trigger Keyword</label>
      <input
        className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="e.g. interested, help, pricing"
      />

      <label className="block text-sm text-gray-300">Automation DM</label>
      <textarea
        className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 h-28"
        value={dm}
        onChange={(e) => setDm(e.target.value)}
        placeholder="Hi! Thanks for your comment — I'd love to help. Can you share more details?"
      />

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">Your rule will send this DM automatically when the keyword is found.</div>
        <div className="flex items-center space-x-3">
          {message && (
            <div className={`${message.type === "error" ? "text-red-400" : "text-emerald-300"} text-sm`}>
              {message.text}
            </div>
          )}
          <button
            type="submit"
            className="btn-gradient"
            disabled={loading}
          >
            {loading ? "Creating…" : "Create Rule"}
          </button>
        </div>
      </div>
    </form>
  );
}
