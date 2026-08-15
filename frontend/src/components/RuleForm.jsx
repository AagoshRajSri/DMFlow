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
      <label className="block text-sm text-gray-300">Keyword</label>
      <input
        className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="hello"
      />

      <label className="block text-sm text-gray-300">DM Message</label>
      <textarea
        className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 h-28"
        value={dm}
        onChange={(e) => setDm(e.target.value)}
        placeholder="Thanks for commenting!"
      />

      <div className="flex items-center space-x-3">
        <button
          type="submit"
          className="px-4 py-2 bg-emerald-500 text-black font-semibold rounded-md disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating…" : "Create Rule"}
        </button>
        {message && (
          <div
            className={`${message.type === "error" ? "text-red-400" : "text-emerald-300"} text-sm`}
          >
            {message.text}
          </div>
        )}
      </div>
    </form>
  );
}
