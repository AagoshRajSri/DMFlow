const Bottleneck = require("bottleneck");
const DMJob = require("./models/DMJob");
const Delivery = require("./models/Delivery");
const PseudoGramClient = require("./pseudogramClient");
const axios = require("axios");

// MAX_RETRIES will be read at runtime to respect env changes

function jitter(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createLimiter() {
  const reservoir = Number(process.env.PSEUDOGRAM_RATE_LIMIT || 8);
  const reservoirRefreshInterval = Number(
    process.env.PSEUDOGRAM_RATE_INTERVAL_MS || 60000,
  );
  return new Bottleneck({
    reservoir,
    reservoirRefreshAmount: reservoir,
    reservoirRefreshInterval,
    maxConcurrent: 1,
  });
}

function buildClient() {
  const limiter = createLimiter();
  return new PseudoGramClient({
    baseURL:
      process.env.PSEUDOGRAM_BASE_URL || "https://pseudogram-api.onrender.com",
    apiKey: process.env.PSEUDOGRAM_API_KEY,
    limiter,
  });
}

async function processOne(client) {
  const now = new Date();
  const job = await DMJob.findOneAndUpdate(
    { status: "queued", nextAttemptAt: { $lte: now } },
    { $set: { status: "processing", updatedAt: new Date() } },
    { sort: { nextAttemptAt: 1 }, new: true },
  );
  if (!job) {
    return false;
  }

  console.log(
    "WORKER PICKED JOB:",
    job._id.toString(),
    job.recipientUserId,
    job.status,
  );
  const j = job;

  // We do not increment attempts before calling the API to avoid counting 429s
  const maxRetries = Number(process.env.MAX_DM_RETRIES || 5);
  const idempotencyKey = `${j.ruleId.toString()}:${j.recipientUserId}`;
  const payload = {
    recipient_user_id: j.recipientUserId,
    message: j.message,
    comment_id: j.commentId,
  };

  try {
    console.log("DM REQUEST", { jobId: j._id.toString(), recipient: j.recipientUserId });
    const resp = await client.sendDM(payload, idempotencyKey);
    console.log("DM RESPONSE", { jobId: j._id.toString(), status: resp.status });

    // Handle rate limited explicitly: do NOT increment attempts
    if (resp.status === 429) {
      const ra = resp.headers["retry-after"];
      const wait = ra ? Number(ra) * 1000 : Number(process.env.PSEUDOGRAM_RATE_INTERVAL_MS || 60000);
      j.status = "queued";
      j.nextAttemptAt = new Date(Date.now() + wait);
      await j.save();
      console.log("JOB RATE LIMITED", j._id.toString(), "retryAt=", j.nextAttemptAt.toISOString());
      return true;
    }

    // For non-429 responses, increment attempts because an attempt was consumed
    j.attempts = (j.attempts || 0) + 1;

    if (resp.status === 202 || resp.status === 200 || resp.status === 201) {
      const data = resp.data || {};
      j.dmId = data.dm_id || data.id || null;
      j.status = "accepted";
      await j.save();

      // Atomic upsert for Delivery: create if not exists
      try {
        const upsertRes = await Delivery.updateOne(
          { ruleId: j.ruleId, recipientUserId: j.recipientUserId },
          { $setOnInsert: { ruleId: j.ruleId, recipientUserId: j.recipientUserId, status: "queued", createdAt: new Date() } },
          { upsert: true },
        );
        // If already existed, record duplicate_blocked state for visibility
        if (upsertRes && upsertRes.upsertedCount === 0) {
          // delivery existed
          console.log("DUPLICATE BLOCKED (delivery exists)", j.ruleId.toString(), j.recipientUserId);
        }
      } catch (err) {
        console.error("delivery upsert error", err && err.message ? err.message : err);
      }

      console.log("JOB ACCEPTED", j._id.toString(), j.recipientUserId);
      return true;
    }

    if (resp.status >= 500 && resp.status < 600) {
      // schedule retry with exponential backoff + jitter
      const backoff = Math.min(30000, 500 * Math.pow(2, j.attempts));
      const next = backoff + jitter(0, 1000);
      if (j.attempts >= maxRetries) {
        j.status = "failed";
        j.lastError = `status_${resp.status}`;
        console.log("JOB FAILED", j._id.toString(), `status_${resp.status}`);
      } else {
        j.status = "queued";
        j.nextAttemptAt = new Date(Date.now() + next);
        console.log("JOB RETRY", j._id.toString(), "nextAttemptAt=", j.nextAttemptAt.toISOString());
      }
      await j.save();
      return true;
    }

    // other 4xx -> do not retry
    j.status = "failed";
    j.lastError = `status_${resp.status}`;
    await j.save();
    console.log("JOB FAILED", j._id.toString(), `status_${resp.status}`);
    return true;
  } catch (err) {
    // network or unexpected
    console.error("DM SEND ERROR", { jobId: j._id.toString(), err: err && err.message ? err.message : String(err) });
    j.attempts = (j.attempts || 0) + 1;
    const backoff = Math.min(30000, 500 * Math.pow(2, j.attempts));
    if (j.attempts >= maxRetries) {
      j.status = "failed";
      j.lastError = err.message;
      console.log("JOB FAILED", j._id.toString(), err && err.message ? err.message : err);
    } else {
      j.status = "queued";
      j.nextAttemptAt = new Date(Date.now() + backoff);
      console.log("JOB RETRY", j._id.toString(), "nextAttemptAt=", j.nextAttemptAt.toISOString());
    }
    await j.save();
    return true;
  }
}

async function reconciliationLoop(client) {
  // find accepted jobs with dmId
  const accepted = await DMJob.find({
    status: "accepted",
    dmId: { $exists: true, $ne: null },
  }).limit(50);
  for (const j of accepted) {
    try {
      const resp = await client.getDMStatus(j.dmId);
      if (resp.status === 200) {
        const data = resp.data || {};
        const st = data.status;
        if (st === "delivered") {
          j.status = "delivered";
          await j.save();
          await Delivery.updateOne(
            { ruleId: j.ruleId, recipientUserId: j.recipientUserId },
            { $set: { status: "delivered", lastUpdatedAt: new Date() } },
          ).catch(() => {});
        } else if (st === "failed") {
          // schedule retry unless attempts exhausted
          const maxRetries = Number(process.env.MAX_DM_RETRIES || 5);
          if (j.attempts >= maxRetries) {
            j.status = "failed";
            await j.save();
            await Delivery.updateOne(
              { ruleId: j.ruleId, recipientUserId: j.recipientUserId },
              { $set: { status: "failed", lastUpdatedAt: new Date() } },
            ).catch(() => {});
          } else {
            j.status = "queued";
            j.nextAttemptAt = new Date(
              Date.now() + 1000 * Math.pow(2, j.attempts),
            );
            await j.save();
          }
        }
      }
    } catch (err) {
      // ignore and continue
    }
  }
}

module.exports = { processOne, reconciliationLoop, buildClient };
