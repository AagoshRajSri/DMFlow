const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const fetch = require('node-fetch');
const Bottleneck = require('bottleneck');

// Configuration
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linkplease';
const PSEUDOGRAM_API_KEY = process.env.PSEUDOGRAM_API_KEY || '';
if (!PSEUDOGRAM_API_KEY) {
  console.warn('Warning: PSEUDOGRAM_API_KEY is not set. DM sends will fail without it.');
}

// Pseudogram endpoints
const PSEUDO_BASE = 'https://pseudogram-api.onrender.com';

// Rate limiting: 10 req / 60s
const limiter = new Bottleneck({
  reservoir: 10,
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 1,
});

// In-memory work queue (fast response on webhook)
const workQueue = [];
let processing = false;

async function processQueue(db) {
  if (processing) return;
  processing = true;
  while (workQueue.length) {
    const job = workQueue.shift();
    try {
      await handleWebhookJob(db, job).catch(err => {
        console.error('Job failed:', err && err.stack ? err.stack : err);
      });
    } catch (e) {
      console.error('Unexpected worker error', e);
    }
  }
  processing = false;
}

async function handleWebhookJob(db, payload) {
  const { event_id, comment } = payload;
  if (!event_id) return; // ignore malformed

  const processedColl = db.collection('processed_events');
  try {
    await processedColl.insertOne({ event_id, received_at: new Date() });
  } catch (err) {
    // duplicate key -> already processed
    if (err.code === 11000) return;
    throw err;
  }

  if (!comment || !comment.text) return;

  // find rules that match comment text (case-insensitive contains)
  const rulesColl = db.collection('rules');
  const text = comment.text;
  const rules = await rulesColl.find({
    keyword: { $exists: true },
  }).toArray();

  for (const rule of rules) {
    try {
      if (typeof rule.keyword !== 'string') continue;
      const re = new RegExp(rule.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!re.test(text)) continue;

      // enforce per-user-per-rule single DM (never DM twice for same rule)
      const dmsColl = db.collection('dms');
      const userId = comment.from && comment.from.user_id;
      if (!userId) continue;

      const existing = await dmsColl.findOne({ user_id: userId, rule_id: rule._id.toString(), status: { $in: ['queued','sending','delivered'] } });
      if (existing) {
        // record blocked attempt
        await dmsColl.insertOne({
          user_id: userId,
          rule_id: rule._id.toString(),
          status: 'blocked',
          created_at: new Date(),
          reason: 'duplicate_per_user_rule'
        });
        continue;
      }

      // create DM record and enqueue send
      const dmDoc = {
        user_id: userId,
        rule_id: rule._id.toString(),
        dm_message: rule.dm_message,
        status: 'pending',
        attempts: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const res = await dmsColl.insertOne(dmDoc);
      const dmRecordId = res.insertedId.toString();

      // schedule send via limiter
      limiter.schedule(() => attemptSend(db, dmRecordId)).catch(err => {
        console.error('Limiter send error', err);
      });

    } catch (err) {
      console.error('Error processing rule:', err && err.stack ? err.stack : err);
    }
  }
}

async function attemptSend(db, dmRecordId) {
  const dmsColl = db.collection('dms');
  const dm = await dmsColl.findOne({ _id: new ObjectId(dmRecordId) });
  if (!dm) return;
  if (dm.status === 'delivered' || dm.status === 'failed' || dm.status === 'sending') return;

  // mark as sending
  await dmsColl.updateOne({ _id: dm._id }, { $set: { status: 'sending', updated_at: new Date() } });

  const idempotencyKey = dmRecordId;
  const body = { to_user_id: dm.user_id, message: dm.dm_message };

  const maxRetries = 5;
  let attempt = 0;
  let backoff = 500;
  while (attempt < maxRetries) {
    attempt += 1;
    try {
      await dmsColl.updateOne({ _id: dm._id }, { $set: { attempts: attempt, updated_at: new Date() } });
      const resp = await fetch(`${PSEUDO_BASE}/v1/dm/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PSEUDOGRAM_API_KEY}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (resp.status === 201 || resp.status === 200) {
        const data = await resp.json();
        const dm_id = data.dm_id || data.id || null;
        await dmsColl.updateOne({ _id: dm._id }, { $set: { dm_id, status: 'queued', updated_at: new Date() } });
        return;
      }

      if (resp.status === 429) {
        const ra = resp.headers.get('Retry-After');
        const waitSec = ra ? Number(ra) : 10;
        console.warn('Rate limited, retry-after', waitSec);
        // respect Retry-After
        await sleep(waitSec * 1000);
        continue;
      }

      if (resp.status >= 500 && resp.status < 600) {
        // transient
        await sleep(backoff);
        backoff *= 2;
        continue;
      }

      // client error -> mark failed
      const text = await resp.text().catch(() => '');
      await dmsColl.updateOne({ _id: dm._id }, { $set: { status: 'failed', updated_at: new Date(), last_error: `HTTP ${resp.status} ${text}` } });
      return;

    } catch (err) {
      // network or other error, exponential backoff
      console.warn('Send attempt error, retrying', err && err.message ? err.message : err);
      await sleep(backoff);
      backoff *= 2;
    }
  }

  // exhausted
  await dmsColl.updateOne({ _id: dm._id }, { $set: { status: 'failed', updated_at: new Date(), last_error: 'exhausted_retries' } });
}

async function pollDms(db) {
  const dmsColl = db.collection('dms');
  const toCheck = await dmsColl.find({ status: { $in: ['queued','sending'] } }).limit(50).toArray();
  for (const dm of toCheck) {
    if (!dm.dm_id) continue;
    try {
      const resp = await fetch(`${PSEUDO_BASE}/v1/dm/${encodeURIComponent(dm.dm_id)}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${PSEUDOGRAM_API_KEY}` },
      });
      if (resp.status === 200) {
        const data = await resp.json();
        // assume data.status in queued|delivered|failed
        const status = data.status || 'queued';
        let mapped = 'queued';
        if (status === 'delivered') mapped = 'delivered';
        if (status === 'failed') mapped = 'failed';
        await dmsColl.updateOne({ _id: dm._id }, { $set: { status: mapped, updated_at: new Date(), remote: data } });
      } else if (resp.status === 429) {
        const ra = resp.headers.get('Retry-After');
        const waitSec = ra ? Number(ra) : 10;
        await sleep(waitSec * 1000);
      } else {
        // ignore other statuses
      }
    } catch (err) {
      console.warn('Poll error', err && err.message ? err.message : err);
    }
  }
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function main() {
  const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db();

  // ensure indexes
  await db.collection('processed_events').createIndex({ event_id: 1 }, { unique: true }).catch(() => {});
  await db.collection('rules').createIndex({ keyword: 1 }).catch(() => {});
  await db.collection('dms').createIndex({ user_id: 1, rule_id: 1 }).catch(() => {});

  const app = express();
  app.use(express.json({ limit: '128kb' }));

  // POST /webhook -> respond quickly, offload processing
  app.post('/webhook', (req, res) => {
    const payload = req.body || {};
    // push to queue and respond immediately
    workQueue.push(payload);
    // trigger async processing but don't await
    processQueue(db).catch(err => console.error('Queue processor error', err));
    // minimal response
    res.status(200).send('OK');
  });

  // POST /rules
  app.post('/rules', async (req, res) => {
    try {
      const { keyword, dm_message } = req.body || {};
      if (!keyword || !dm_message) return res.status(400).json({ error: 'keyword and dm_message required' });
      const rulesColl = db.collection('rules');
      const r = await rulesColl.insertOne({ keyword, dm_message, created_at: new Date() });
      const out = { rule_id: r.insertedId.toString(), keyword, dm_message };
      res.status(201).json(out);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /stats
  app.get('/stats', async (req, res) => {
    try {
      const dmsColl = db.collection('dms');
      const sent = await dmsColl.countDocuments({ status: 'delivered' });
      const failed = await dmsColl.countDocuments({ status: 'failed' });
      const queued = await dmsColl.countDocuments({ status: { $in: ['queued','sending','pending'] } });
      const duplicates_blocked = await dmsColl.countDocuments({ status: 'blocked' });
      res.json({ sent, failed, queued, duplicates_blocked });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // health
  app.get('/health', (_req, res) => res.send('ok'));

  app.listen(PORT, () => {
    console.log(`LinkPlease webhook server listening on port ${PORT}`);
  });

  // poller intervals
  setInterval(() => {
    pollDms(db).catch(err => console.error('Poller error', err));
  }, 15 * 1000);

  // ensure queue processing periodically in case of missed triggers
  setInterval(() => {
    processQueue(db).catch(err => console.error('Queue run error', err));
  }, 2000);
}

main().catch(err => {
  console.error('Fatal error', err);
  process.exit(1);
});
