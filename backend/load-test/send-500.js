const axios = require("axios");
const PSEUDO_BASE = process.env.PSEUDOGRAM_BASE_URL || "http://localhost:3000";

async function sendBatch(url, count, concurrency = 50) {
  const tasks = [];
  const crypto = require("crypto");
  for (let i = 0; i < count; i++) {
    const payload = {
      event_id: `lt_${Date.now()}_${i}`,
      event_type: "comment.created",
      data: {
        comment_id: `c_${i}`,
        text: "PRICE please",
        created_at: new Date().toISOString(),
        from: { user_id: `u_${i % 10}` },
      },
    };
    const raw = JSON.stringify(payload);
    tasks.push(() =>
      (async () => {
        try {
          const key = process.env.PSEUDOGRAM_API_KEY || "";
          const sig = crypto
            .createHmac("sha256", key)
            .update(raw)
            .digest("hex");
          await axios.post(url + "/webhook", raw, {
            headers: {
              "Content-Type": "application/json",
              "X-PseudoGram-Signature": "sha256=" + sig,
            },
          });
        } catch (e) {}
      })(),
    );
  }

  // run in controlled concurrency
  const running = [];
  while (tasks.length) {
    while (running.length < concurrency && tasks.length) {
      const fn = tasks.shift();
      const p = fn().then(() => running.splice(running.indexOf(p), 1));
      running.push(p);
    }
    await Promise.race(running);
  }
  await Promise.all(running);
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const url = process.env.TARGET_URL || "http://localhost:3000";
  console.log("Sending 500 events to", url);
  await sendBatch(url, 500, 100);
  console.log("Sent 500 events; waiting 20s for processing...");
  await wait(20000);
  try {
    const s = await axios
      .get(url + "/stats")
      .then((r) => r.data)
      .catch(() => null);
    console.log("Stats after run:", s);
  } catch (e) {
    console.error("Failed to fetch stats", e.message);
  }
})();
