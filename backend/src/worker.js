const Bottleneck = require('bottleneck');
const DMJob = require('./models/DMJob');
const Delivery = require('./models/Delivery');
const PseudoGramClient = require('./pseudogramClient');
const axios = require('axios');

// MAX_RETRIES will be read at runtime to respect env changes

function jitter(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function createLimiter() {
  return new Bottleneck({
    reservoir: 10,
    reservoirRefreshAmount: 10,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 1,
  });
}

function buildClient() {
  const limiter = createLimiter();
  return new PseudoGramClient({ baseURL: process.env.PSEUDOGRAM_BASE_URL || 'https://pseudogram-api.onrender.com', apiKey: process.env.PSEUDOGRAM_API_KEY, limiter });
}

async function processOne(client) {
  const now = new Date();
  const job = await DMJob.findOneAndUpdate({ status: 'queued', nextAttemptAt: { $lte: now } }, { $set: { status: 'processing', updatedAt: new Date() } }, { sort: { nextAttemptAt: 1 }, new: true });
  if (!job) return false;
  const j = job;

  try {
    j.attempts += 1;
    await j.save();
    const maxRetries = Number(process.env.MAX_DM_RETRIES || 5);

    // deterministic idempotency key
    const idempotencyKey = `${j.ruleId.toString()}:${j.recipientUserId}`;
    const payload = { recipient_user_id: j.recipientUserId, message: j.message, comment_id: j.commentId };

    const resp = await client.sendDM(payload, idempotencyKey);
    if (resp.status === 202 || resp.status === 200 || resp.status === 201) {
      const data = resp.data || {};
      j.dmId = data.dm_id || data.id || null;
      j.status = 'accepted';
      await j.save();
      // ensure Delivery exists (upsert) without creating duplicates
      try {
        await Delivery.create({ ruleId: j.ruleId, recipientUserId: j.recipientUserId });
      } catch (err) {
        // duplicate -> increment duplicate counter stored as a blocked DMJob
        if (err.code === 11000) {
          // create a blocked job record by setting status failed with reason
          // we keep duplicate handling in webhook flow ideally; here just continue
        }
      }
      return true;
    }

    if (resp.status === 429) {
      const ra = resp.headers['retry-after'];
      const wait = ra ? Number(ra) * 1000 : 10000;
      j.status = 'queued';
      j.nextAttemptAt = new Date(Date.now() + wait);
      await j.save();
      return true;
    }

    if (resp.status >= 500 && resp.status < 600) {
      // schedule retry with exponential backoff + jitter
      const backoff = Math.min(30000, 500 * Math.pow(2, j.attempts));
      const next = backoff + jitter(0, 1000);
      if (j.attempts >= maxRetries) {
        j.status = 'failed';
        j.lastError = `status_${resp.status}`;
      } else {
        j.status = 'queued';
        j.nextAttemptAt = new Date(Date.now() + next);
      }
      await j.save();
      return true;
    }

    // other 4xx -> do not retry
    j.status = 'failed';
    j.lastError = `status_${resp.status}`;
    await j.save();
    return true;
  } catch (err) {
    // network or unexpected
    const backoff = Math.min(30000, 500 * Math.pow(2, j.attempts));
    if (j.attempts >= maxRetries) {
      j.status = 'failed';
      j.lastError = err.message;
    } else {
      j.status = 'queued';
      j.nextAttemptAt = new Date(Date.now() + backoff);
    }
    await j.save();
    return true;
  }
}

async function reconciliationLoop(client) {
  // find accepted jobs with dmId
  const accepted = await DMJob.find({ status: 'accepted', dmId: { $exists: true, $ne: null } }).limit(50);
  for (const j of accepted) {
    try {
      const resp = await client.getDMStatus(j.dmId);
      if (resp.status === 200) {
        const data = resp.data || {};
        const st = data.status;
        if (st === 'delivered') {
          j.status = 'delivered';
          await j.save();
          await Delivery.updateOne({ ruleId: j.ruleId, recipientUserId: j.recipientUserId }, { $set: { status: 'delivered', lastUpdatedAt: new Date() } }).catch(()=>{});
        } else if (st === 'failed') {
          // schedule retry unless attempts exhausted
          const maxRetries = Number(process.env.MAX_DM_RETRIES || 5);
          if (j.attempts >= maxRetries) {
            j.status = 'failed';
            await j.save();
            await Delivery.updateOne({ ruleId: j.ruleId, recipientUserId: j.recipientUserId }, { $set: { status: 'failed', lastUpdatedAt: new Date() } }).catch(()=>{});
          } else {
            j.status = 'queued';
            j.nextAttemptAt = new Date(Date.now() + 1000 * Math.pow(2, j.attempts));
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
