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
    <form onSubmit={submit} className="space-y-5 bg-[#121212] p-6 rounded-3xl border border-[#262626]">
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">When user comments this keyword...</label>
        <input
          className="w-full bg-[#000000] border border-[#262626] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all placeholder:text-gray-700 font-medium"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. link, price, guide"
        />
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Send this automated DM</label>
        <textarea
          className="w-full bg-[#000000] border border-[#262626] rounded-xl px-4 py-3 h-28 text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all placeholder:text-gray-700 resize-none font-medium"
          value={dm}
          onChange={(e) => setDm(e.target.value)}
          placeholder="Hey! Thanks for commenting. Here is the link you asked for..."
        />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[#262626]">
        <div className="text-xs text-gray-500 font-medium max-w-[50%]">
          Active instantly upon creation.
        </div>
        <div className="flex items-center space-x-3">
          {message && (
            <div
              className={`${message.type === "error" ? "text-red-500" : "text-emerald-500"} text-sm font-bold animate-pulse`}
            >
              {message.text}
            </div>
          )}
          <button 
            type="submit" 
            className="ig-gradient text-white font-bold px-6 py-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 shadow-lg" 
            disabled={loading}
          >
            {loading ? "Saving…" : "Save Automation"}
          </button>
        </div>
      </div>
    </form>
  );
}
