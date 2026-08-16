import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import Header from "./components/Header";
import Stats from "./components/Stats";
import RuleForm from "./components/RuleForm";
import RulesList from "./components/RulesList";
import WebhookTest from "./components/WebhookTest";

const BASE =
  import.meta.env.VITE_API_BASE || "https://dmflow-wgoy.onrender.com";

export default function App() {
  const [backendOnline, setBackendOnline] = useState(false);
  const [stats, setStats] = useState({
    sent: 0,
    failed: 0,
    queued: 0,
    duplicates_blocked: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [rules, setRules] = useState([]);
  const statsTimer = useRef(null);

  const fetchHealth = async () => {
    try {
      await axios.get(`${BASE}/stats`, { timeout: 4000 });
      setBackendOnline(true);
    } catch (e) {
      setBackendOnline(false);
    }
  };

  const fetchStats = async (isBackgroundPoll = false) => {
    if (!isBackgroundPoll) setLoadingStats(true);
    try {
      const res = await axios.get(`${BASE}/stats`);
      setStats(res.data);
      setBackendOnline(true);
    } catch (e) {
      setBackendOnline(false);
    } finally {
      if (!isBackgroundPoll) setLoadingStats(false);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await axios.get(`${BASE}/rules`);
      setRules(res.data);
    } catch (e) {
      console.error("Failed to fetch rules", e);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchStats(false);
    fetchRules();
    statsTimer.current = setInterval(() => fetchStats(true), 5000);
    return () => clearInterval(statsTimer.current);
  }, []);

  const handleAddRule = (rule) => {
    setRules((r) => [rule, ...r]);
  };

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      <Header online={backendOnline} fetchHealth={fetchHealth} />

      <div className="mt-6 grid gap-6">
        <Stats stats={stats} loading={loadingStats} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-3">
              Create Automation Rule
            </h3>
            <RuleForm base={BASE} onSuccess={handleAddRule} />
          </div>

          <div className="card flex flex-col">
            <h3 className="text-lg font-semibold mb-3">Live Instagram Demo</h3>
            <div className="flex-1">
              <WebhookTest rules={rules} base={BASE} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-3">
            Your Rules (this session)
          </h3>
          <RulesList rules={rules} />
        </div>
      </div>
    </div>
  );
}
