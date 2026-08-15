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
  const reservoir = Number(process.env.PSEUDOGRAM_RATE_LIMIT || 60);
  const reservoirRefreshInterval = Number(
    process.env.PSEUDOGRAM_RATE_INTERVAL_MS || 60000,
  );
  const maxConcurrent = Number(process.env.PSEUDOGRAM_MAX_CONCURRENT || 5);
  console.log("PseudoGram limiter settings:", { reservoir, reservoirRefreshInterval, maxConcurrent });
  return new Bottleneck({
    reservoir,
    reservoirRefreshAmount: reservoir,
    reservoirRefreshInterval,
    maxConcurrent,
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
  const processingStartedAt = new Date();
  const job = await DMJob.findOneAndUpdate(
    { status: "queued", nextAttemptAt: { $lte: now } },
    { $set: { status: "processing", processingStartedAt, updatedAt: new Date() } },
    { sort: { nextAttemptAt: 1 }, new: true },
  );
  if (!job) return false;

  console.log("WORKER CLAIMED JOB", job._id.toString());

  // spawn an independent handler so the loop can keep claiming jobs.
  (async function handleSend(j) {
    const maxRetries = Number(process.env.MAX_DM_RETRIES || 5);
    const idempotencyKey = `${j.ruleId.toString()}:${j.recipientUserId}`;
    const payload = {
      recipient_user_id: j.recipientUserId,
      message: j.message,
      comment_id: j.commentId,
    };

    let updated = false;
    try {
      console.log("DM REQUEST", j._id.toString());
      const resp = await client.sendDM(payload, idempotencyKey);
      console.log("DM RESPONSE", j._id.toString(), resp.status);

      if (resp.status === 429) {
        const ra = resp.headers["retry-after"];
        const wait = ra ? Number(ra) * 1000 : Number(process.env.PSEUDOGRAM_RATE_INTERVAL_MS || 60000);
        await DMJob.findByIdAndUpdate(j._id, { $set: { status: "queued", nextAttemptAt: new Date(Date.now() + wait), updatedAt: new Date() } });
        console.log("JOB RATE LIMITED", j._id.toString(), "retryAt=", new Date(Date.now() + wait).toISOString());
        updated = true;
        return;
      }

      // increment attempts for non-429 cases (actual attempt consumed)
      const attempts = (j.attempts || 0) + 1;

      if (resp.status === 202 || resp.status === 200 || resp.status === 201) {
        const data = resp.data || {};
        const dmId = data.dm_id || data.id || null;
        await DMJob.findByIdAndUpdate(j._id, { $set: { status: "accepted", dmId, attempts, updatedAt: new Date() } });
        updated = true;

        try {
          const upsertRes = await Delivery.updateOne(
            { ruleId: j.ruleId, recipientUserId: j.recipientUserId },
            { $setOnInsert: { ruleId: j.ruleId, recipientUserId: j.recipientUserId, status: "queued", createdAt: new Date() } },
            { upsert: true },
          );
          if (upsertRes && upsertRes.upsertedCount === 0) {
            console.log("DUPLICATE BLOCKED (delivery exists)", j.ruleId.toString(), j.recipientUserId);
          }
        } catch (err) {
          console.error("delivery upsert error", err && err.message ? err.message : err);
        }

        console.log("JOB ACCEPTED", j._id.toString(), dmId);
        return;
      }

      if (resp.status >= 500 && resp.status < 600) {
        const backoff = Math.min(30000, 500 * Math.pow(2, attempts));
        const next = backoff + jitter(0, 1000);
          if (attempts >= maxRetries) {
          await DMJob.findByIdAndUpdate(j._id, { $set: { status: "failed", lastError: `status_${resp.status}`, attempts, updatedAt: new Date() } });
          updated = true;
          console.log("JOB FAILED", j._id.toString(), `status_${resp.status}`);
        } else {
          await DMJob.findByIdAndUpdate(j._id, { $set: { status: "queued", nextAttemptAt: new Date(Date.now() + next), attempts, updatedAt: new Date() } });
          updated = true;
          console.log("JOB RETRY", j._id.toString(), "nextAttemptAt=", new Date(Date.now() + next).toISOString());
        }
        return;
      }

      // other 4xx -> do not retry
      await DMJob.findByIdAndUpdate(j._id, { $set: { status: "failed", lastError: `status_${resp.status}`, attempts, updatedAt: new Date() } });
      updated = true;
      console.log("JOB FAILED", j._id.toString(), `status_${resp.status}`);
      return;
    } catch (err) {
      console.error("DM SEND ERROR", { jobId: j._id.toString(), err: err && err.message ? err.message : String(err) });
      const attempts = (j.attempts || 0) + 1;
      const backoff = Math.min(30000, 500 * Math.pow(2, attempts));
      if (attempts >= maxRetries) {
        await DMJob.findByIdAndUpdate(j._id, { $set: { status: "failed", lastError: err.message, attempts, updatedAt: new Date() } });
        updated = true;
        console.log("JOB FAILED", j._id.toString(), err && err.message ? err.message : err);
      } else {
        await DMJob.findByIdAndUpdate(j._id, { $set: { status: "queued", nextAttemptAt: new Date(Date.now() + backoff), attempts, updatedAt: new Date() } });
        updated = true;
        console.log("JOB RETRY", j._id.toString(), "nextAttemptAt=", new Date(Date.now() + backoff).toISOString());
      }
      return;
    }
    finally {
      try {
        // ensure the job never stays 'processing' due to an unexpected exception
        if (!updated) {
          const cur = await DMJob.findById(j._id).lean();
          if (cur && cur.status === "processing") {
            // push back to queue immediately
            await DMJob.findByIdAndUpdate(j._id, { $set: { status: "queued", nextAttemptAt: new Date(), processingStartedAt: null, updatedAt: new Date() }, $inc: { recoveredCount: 1 } });
            console.log("RECOVERED STALE JOB", j._id.toString());
          }
        }
      } catch (e) {
        console.error("finalizer error", e && e.message ? e.message : e);
      }
    }
  })(job).catch((e) => console.error("handleSend fatal", e && e.message ? e.message : e));

  return true;
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
          console.log("JOB DELIVERED", j._id.toString());
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

async function recoverStaleProcessing() {
  const timeout = Number(process.env.PROCESSING_TIMEOUT_MS || 120000);
  const staleBefore = new Date(Date.now() - timeout);
  // find stale processing jobs without a confirmed dmId
  const stale = await DMJob.find({
    status: "processing",
    processingStartedAt: { $lte: staleBefore },
    $or: [{ dmId: { $exists: false } }, { dmId: null }],
  }).limit(1000);
  for (const s of stale) {
    try {
      await DMJob.updateOne({ _id: s._id, status: "processing" }, { $set: { status: "queued", nextAttemptAt: new Date(), processingStartedAt: null, updatedAt: new Date() }, $inc: { recoveredCount: 1 } });
      console.log("RECOVERED STALE JOB", s._id.toString());
    } catch (err) {
      // ignore per-job errors
    }
  }
}

module.exports = { processOne, reconciliationLoop, buildClient, recoverStaleProcessing };
