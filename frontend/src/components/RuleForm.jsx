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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Trigger Keyword</label>
        <input
          className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-gray-600"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. interested, help, pricing"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Automation DM</label>
        <textarea
          className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 h-28 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-gray-600 resize-none"
          value={dm}
          onChange={(e) => setDm(e.target.value)}
          placeholder="Hi! Thanks for your comment — I'd love to help. Can you share more details?"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-gray-500 max-w-[50%]">
          Your rule will send this DM automatically when the keyword is found.
        </div>
        <div className="flex items-center space-x-3">
          {message && (
            <div
              className={`${message.type === "error" ? "text-red-400" : "text-emerald-400"} text-sm font-medium animate-pulse`}
            >
              {message.text}
            </div>
          )}
          <button 
            type="submit" 
            className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium px-6 py-2 rounded-full hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 disabled:hover:shadow-none" 
            disabled={loading}
          >
            {loading ? "Creating…" : "Create Rule"}
          </button>
        </div>
      </div>
    </form>
  );
}
