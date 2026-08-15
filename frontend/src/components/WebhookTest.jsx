import React, { useState, useEffect } from "react";

export default function WebhookTest({ rules = [] }) {
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([
    { id: 1, user: "random_user", text: "Love this content! 🔥" }
  ]);
  const [dmNotification, setDmNotification] = useState(null);

  const handleSend = (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment = {
      id: Date.now(),
      user: "you",
      text: commentText
    };

    setComments((prev) => [...prev, newComment]);
    
    // Check if the comment matches any rule
    const matchedRule = rules.find((r) => 
      commentText.toLowerCase().includes(r.keyword.toLowerCase())
    );

    if (matchedRule) {
      setTimeout(() => {
        setDmNotification(`DMFlow: ${matchedRule.dm_message}`);
        setTimeout(() => setDmNotification(null), 5000);
      }, 800); // simulate a slight delay for realism
    }

    setCommentText("");
  };

  return (
    <div className="relative h-[400px] w-full max-w-sm mx-auto bg-[#000] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col font-sans">
      
      {/* Top Header - Mock Instagram Post Header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-800">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
          <div className="bg-black w-full h-full rounded-full flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">DM</span>
          </div>
        </div>
        <div className="ml-3 text-sm font-semibold text-white">
          dmflow_official
        </div>
      </div>

      {/* Post Image Area (Mock) */}
      <div className="h-40 w-full bg-gray-900 flex items-center justify-center border-b border-gray-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-600/20" />
        <span className="text-gray-500 text-sm font-medium z-10">Comment your keyword below! 👇</span>
      </div>

      {/* DM Notification Popup */}
      {dmNotification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[90%] bg-gray-900/95 border border-gray-700 rounded-xl p-3 shadow-2xl z-20 animate-slide-down backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-white mb-1">New Message Request</p>
              <p className="text-xs text-gray-300 line-clamp-2">{dmNotification}</p>
            </div>
          </div>
        </div>
      )}

      {/* Comments Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black scrollbar-hide">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3 text-sm">
             <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${c.user === 'you' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
              {c.user === 'you' ? 'Y' : 'U'}
            </div>
            <div>
              <span className="font-semibold text-white mr-2">{c.user}</span>
              <span className="text-gray-200">{c.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Comment Input */}
      <div className="p-3 border-t border-gray-800 bg-black">
        <form onSubmit={handleSend} className="flex items-center gap-2 relative">
          <input
            type="text"
            className="w-full bg-gray-900 border border-gray-800 rounded-full pl-4 pr-10 py-2 text-sm text-white focus:outline-none focus:border-gray-600 transition-colors"
            placeholder={rules.length > 0 ? `Try typing "${rules[0].keyword}"...` : "Add a comment..."}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            className="absolute right-2 text-blue-500 font-semibold text-sm disabled:opacity-50 px-2"
          >
            Post
          </button>
        </form>
      </div>

    </div>
  );
}
