const path = require("path");
// load dotenv from backend/.env without overwriting existing env vars
const fs = require("fs");
const dotenv = require("dotenv");
const envPath = path.resolve(__dirname, "..", ".env");
try {
  const exists = fs.existsSync(envPath);
  if (exists) {
    // try standard dotenv first
    try {
      dotenv.config({ path: envPath });
    } catch (e) {}

    // If still not populated (some environments), do a conservative manual parse
    if (typeof process.env.MONGODB_URI === "undefined") {
      try {
        const content = fs.readFileSync(envPath, "utf8");
        const lines = content.split(/\r?\n/);
        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith("#")) continue;
          const eq = line.indexOf("=");
          if (eq === -1) continue;
          const key = line.slice(0, eq).trim();
          let val = line.slice(eq + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (typeof process.env[key] === "undefined") process.env[key] = val;
        }
      } catch (e) {
        // ignore
      }
    }
  }
} catch (e) {
  // ignore parse errors here; we'll fail later if required vars missing
}
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const cors = require("cors");
const crypto = require("crypto");
const app = require("./app");
const DMJob = require("./models/DMJob");
const { processOne, reconciliationLoop, buildClient } = require("./worker");

const PORT = process.env.PORT || 3000;

function sanitizeError(err) {
  if (!err) return "";
  const msg = err && err.message ? err.message : String(err);
  // redact basic mongodb credentials if accidentally included
  return msg.replace(
    /(mongodb(?:\+srv)?:\/\/)([^:@\s]+):([^@\s]+)@/g,
    "$1<user>:<redacted>@",
  );
}

async function start() {
  // prefer explicit env var names; fail fast if not provided
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error(
      "FATAL: MONGODB_URI not set. Set MONGODB_URI in environment or backend/.env",
    );
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");

  // recover processing jobs
  await DMJob.updateMany(
    { status: "processing" },
    { $set: { status: "queued" } },
  );

  // process any persisted WebhookEvent that hasn't been processed yet
  const { processPendingWebhookEvents } = require("./services/processor");
  await processPendingWebhookEvents();

  const client = buildClient();

  const pollMs = Number(process.env.WORKER_POLL_MS || 1000);
  const reconciliationMs = Number(process.env.RECONCILIATION_MS || 15000);

  let workerRunning = true;
  let workerIdleLogged = false;

  async function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function workerLoop(id) {
    console.log(`WORKER_LOOP[${id}] started`);
    while (workerRunning) {
      try {
        const processed = await processOne(client);
        if (!processed) {
          if (!workerIdleLogged) {
            console.log("WORKER: queue empty, sleeping");
            workerIdleLogged = true;
          }
          await sleep(pollMs);
        } else {
          // work done, continue immediately
          workerIdleLogged = false;
        }
      } catch (err) {
        console.error("worker error", sanitizeError(err));
        await sleep(pollMs);
      }
    }
    console.log(`WORKER_LOOP[${id}] stopped`);
  }

  // start worker loop
  const workerConcurrency = Number(process.env.WORKER_CONCURRENCY || 5);
  const workerTasks = [];
  for (let i = 0; i < workerConcurrency; i++) {
    const t = workerLoop(i).catch((err) =>
      console.error("workerLoop fatal", sanitizeError(err)),
    );
    workerTasks.push(t);
  }

  const reconInterval = setInterval(async () => {
    try {
      await reconciliationLoop(client);
    } catch (err) {
      console.error("recon error", sanitizeError(err));
    }
  }, reconciliationMs);

  const server = app.listen(PORT, () =>
    console.log(`Backend listening ${PORT}`),
  );

  const shutdown = async () => {
    try {
      console.log("Shutting down");
      workerRunning = false;
      // allow reconciliation to stop
      clearInterval(reconInterval);
      // close HTTP server gracefully
      server.close(() => {
        console.log("HTTP server closed");
      });
      // wait for worker loops to finish their current iteration
      try {
        await Promise.race([
          Promise.allSettled(workerTasks),
          new Promise((res) => setTimeout(res, Math.max(pollMs * 2, 1000))),
        ]);
      } catch (e) {
        // ignore
      }
      await mongoose.disconnect();
      console.log("MongoDB disconnected");
      process.exit(0);
    } catch (err) {
      console.error("shutdown error", sanitizeError(err));
      process.exit(1);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("startup error", err);
  process.exit(1);
});
