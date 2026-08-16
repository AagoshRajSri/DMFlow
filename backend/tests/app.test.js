const request = require("supertest");
const crypto = require("crypto");
const mongoose = require("mongoose");
const app = require("../src/app");
const setup = require("./setup");
const Rule = require("../src/models/Rule");
const WebhookEvent = require("../src/models/WebhookEvent");
const DMJob = require("../src/models/DMJob");
const Delivery = require("../src/models/Delivery");

const API_KEY = "testkey";

function sign(bodyStr) {
  return (
    "sha256=" +
    crypto.createHmac("sha256", API_KEY).update(bodyStr).digest("hex")
  );
}

function sendWebhook(payload) {
  const bodyStr = JSON.stringify(payload);
  return request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", sign(bodyStr))
    .send(bodyStr);
}

beforeAll(async () => {
  process.env.PSEUDOGRAM_API_KEY = API_KEY;
  process.env.WEBHOOK_VERIFY_SIGNATURE = "true";
  await setup.setup();
});

afterAll(async () => {
  await setup.teardown();
});

afterEach(async () => {
  await Rule.deleteMany({});
  await WebhookEvent.deleteMany({});
  await DMJob.deleteMany({});
  await Delivery.deleteMany({});
  // clear stats counter
  const db = mongoose.connection.db;
  if (db) await db.collection("stats").deleteMany({});
});

// ─── Part A: POST /rules ───────────────────────────────────────────────────

test("POST /rules — returns 201 with rule_id, keyword, dm_message", async () => {
  const res = await request(app)
    .post("/rules")
    .send({ keyword: "PRICE", dm_message: "Here is the price list" });
  expect(res.status).toBe(201);
  expect(res.body.rule_id).toBeDefined();
  expect(res.body.keyword).toBe("PRICE");
  expect(res.body.dm_message).toBe("Here is the price list");
});

test("POST /rules — 400 when keyword missing", async () => {
  const res = await request(app)
    .post("/rules")
    .send({ dm_message: "Hi" });
  expect(res.status).toBe(400);
});

test("POST /rules — 400 when dm_message missing", async () => {
  const res = await request(app)
    .post("/rules")
    .send({ keyword: "PRICE" });
  expect(res.status).toBe(400);
});

// ─── Part A: POST /webhook basic ──────────────────────────────────────────

test("POST /webhook — returns 200 within 5 seconds", async () => {
  await Rule.create({ keyword: "HELLO", dmMessage: "Hi there" });
  const payload = {
    event_id: "evt_timing",
    event_type: "comment.created",
    data: { comment_id: "c1", text: "HELLO world", from: { user_id: "u1" } },
  };
  const start = Date.now();
  const res = await sendWebhook(payload);
  expect(Date.now() - start).toBeLessThan(5000);
  expect(res.status).toBe(200);
});

test("POST /webhook — creates one DM job for matching comment", async () => {
  await Rule.create({ keyword: "PRICE", dmMessage: "price here" });
  const payload = {
    event_id: "evt_1",
    event_type: "comment.created",
    data: { comment_id: "c1", text: "Can I get the price?", from: { user_id: "usr_1" } },
  };
  const res = await sendWebhook(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "usr_1" });
  expect(jobs.length).toBe(1);
  expect(jobs[0].message).toBe("price here");
});

// ─── Part A: Case-insensitive keyword matching ─────────────────────────────

test("keyword matching is case-insensitive — lowercase comment matches uppercase keyword", async () => {
  await Rule.create({ keyword: "PRICE", dmMessage: "Price info" });
  const payload = {
    event_id: "evt_ci1",
    event_type: "comment.created",
    data: { comment_id: "c_ci1", text: "what is the price?", from: { user_id: "u_ci1" } },
  };
  const res = await sendWebhook(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "u_ci1" });
  expect(jobs.length).toBe(1);
});

test("keyword matching is case-insensitive — uppercase comment matches lowercase keyword", async () => {
  await Rule.create({ keyword: "info", dmMessage: "Here you go" });
  const payload = {
    event_id: "evt_ci2",
    event_type: "comment.created",
    data: { comment_id: "c_ci2", text: "Send me the INFO please", from: { user_id: "u_ci2" } },
  };
  const res = await sendWebhook(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "u_ci2" });
  expect(jobs.length).toBe(1);
});

test("keyword matching — no match when keyword absent", async () => {
  await Rule.create({ keyword: "PRICE", dmMessage: "Price info" });
  const payload = {
    event_id: "evt_nomatch",
    event_type: "comment.created",
    data: { comment_id: "c_nm", text: "great post!", from: { user_id: "u_nm" } },
  };
  const res = await sendWebhook(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "u_nm" });
  expect(jobs.length).toBe(0);
});

test("keyword matches anywhere in comment text", async () => {
  await Rule.create({ keyword: "link", dmMessage: "Here is the link" });
  const payload = {
    event_id: "evt_anywhere",
    event_type: "comment.created",
    data: { comment_id: "c_any", text: "Please send me the link, thanks!", from: { user_id: "u_any" } },
  };
  const res = await sendWebhook(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "u_any" });
  expect(jobs.length).toBe(1);
});

// ─── Part A: user_id identity ─────────────────────────────────────────────

test("user_id is used as identity, not username", async () => {
  await Rule.create({ keyword: "PRICE", dmMessage: "Here" });
  const payload = {
    event_id: "evt_userid",
    event_type: "comment.created",
    data: {
      comment_id: "c_uid",
      text: "PRICE",
      from: { user_id: "uid_123", username: "someuser" },
    },
  };
  const res = await sendWebhook(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({});
  expect(jobs.length).toBe(1);
  expect(jobs[0].recipientUserId).toBe("uid_123");
});

// ─── Part A: No duplicate DMs ─────────────────────────────────────────────

test("same event_id delivered twice — only one DM job created", async () => {
  await Rule.create({ keyword: "PRICE", dmMessage: "Here" });
  const payload = {
    event_id: "evt_dup",
    event_type: "comment.created",
    data: { comment_id: "cdup", text: "PRICE", from: { user_id: "usr_dup" } },
  };
  const bodyStr = JSON.stringify(payload);
  const sig = sign(bodyStr);

  await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", sig)
    .send(bodyStr);
  await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", sig)
    .send(bodyStr);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();

  const events = await WebhookEvent.find({ eventId: "evt_dup" });
  expect(events.length).toBe(1);
  const jobs = await DMJob.find({ recipientUserId: "usr_dup" });
  expect(jobs.length).toBe(1);
});

test("same user comments twice with keyword — only one DM job created", async () => {
  await Rule.create({ keyword: "PRICE", dmMessage: "Here" });

  await sendWebhook({
    event_id: "evt_a1",
    event_type: "comment.created",
    data: { comment_id: "c_a1", text: "price pls", from: { user_id: "u_multi" } },
  });
  await sendWebhook({
    event_id: "evt_a2",
    event_type: "comment.created",
    data: { comment_id: "c_a2", text: "PRICE again", from: { user_id: "u_multi" } },
  });

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();

  const deliveries = await Delivery.find({ recipientUserId: "u_multi" });
  expect(deliveries.length).toBe(1);
  const jobs = await DMJob.find({ recipientUserId: "u_multi" });
  expect(jobs.length).toBe(1);
});

// ─── Part A: comment.deleted ───────────────────────────────────────────────

test("comment.deleted event — no DM job created", async () => {
  await Rule.create({ keyword: "PRICE", dmMessage: "Here" });
  const payload = {
    event_id: "evt_del",
    event_type: "comment.deleted",
    data: { comment_id: "c_del", text: "PRICE", from: { user_id: "u_del" } },
  };
  const res = await sendWebhook(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "u_del" });
  expect(jobs.length).toBe(0);
});

// ─── Part A: crash recovery ────────────────────────────────────────────────

test("processPendingWebhookEvents recovers unprocessed events after crash", async () => {
  await Rule.create({ keyword: "RECOV", dmMessage: "Recovered" });
  await WebhookEvent.create({
    eventId: "evt_recover",
    eventType: "comment.created",
    payload: {
      event_type: "comment.created",
      data: { comment_id: "c_recover", text: "please RECOV", from: { user_id: "u_recov" } },
    },
    processed: false,
  });
  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const deliveries = await Delivery.find({ recipientUserId: "u_recov" });
  expect(deliveries.length).toBe(1);
  const jobs = await DMJob.find({ recipientUserId: "u_recov" });
  expect(jobs.length).toBeGreaterThanOrEqual(1);
});

// ─── Part B: Webhook Signature Verification ────────────────────────────────

test("valid signature — webhook accepted (200)", async () => {
  const payload = {
    event_id: "evt_sig_ok",
    event_type: "comment.created",
    data: { comment_id: "c_sig", text: "hello", from: { user_id: "u_sig" } },
  };
  const bodyStr = JSON.stringify(payload);
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", sign(bodyStr))
    .send(bodyStr);
  expect(res.status).toBe(200);
});

test("invalid signature — webhook rejected (401)", async () => {
  const payload = {
    event_id: "evt_bad_sig",
    event_type: "comment.created",
    data: { comment_id: "cbad", text: "PRICE", from: { user_id: "u_bad" } },
  };
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=aaabbbccc000111222333444555666777888999aaa")
    .send(JSON.stringify(payload));
  expect(res.status).toBe(401);
});

test("missing signature header — webhook rejected (401)", async () => {
  const payload = {
    event_id: "evt_no_sig",
    event_type: "comment.created",
    data: { comment_id: "c_ns", text: "PRICE", from: { user_id: "u_ns" } },
  };
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .send(JSON.stringify(payload));
  expect(res.status).toBe(401);
});

test("malformed signature (no sha256= prefix) — webhook rejected (401)", async () => {
  const payload = {
    event_id: "evt_mal_sig",
    event_type: "comment.created",
    data: { comment_id: "c_ms", text: "PRICE", from: { user_id: "u_ms" } },
  };
  const bodyStr = JSON.stringify(payload);
  const rawHex = crypto.createHmac("sha256", API_KEY).update(bodyStr).digest("hex");
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", rawHex) // missing "sha256=" prefix
    .send(bodyStr);
  expect(res.status).toBe(401);
});

test("tampered body — signature mismatch rejected (401)", async () => {
  const payload = {
    event_id: "evt_tamper",
    event_type: "comment.created",
    data: { comment_id: "c_t", text: "PRICE", from: { user_id: "u_t" } },
  };
  const originalBody = JSON.stringify(payload);
  const validSig = sign(originalBody);

  // Tamper by changing the body after signing
  const tamperedBody = JSON.stringify({ ...payload, data: { ...payload.data, text: "HACKED" } });
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", validSig)
    .send(tamperedBody);
  expect(res.status).toBe(401);
});

test("signature verification uses raw body, not re-serialized JSON", async () => {
  // Body with extra whitespace / different key order — must match on the exact bytes sent
  const payload = {
    event_id: "evt_rawbody",
    event_type: "comment.created",
    data: { comment_id: "c_rb", text: "hello", from: { user_id: "u_rb" } },
  };
  // Serialize with extra spaces (non-compact)
  const bodyStr = JSON.stringify(payload, null, 2);
  const sig = "sha256=" + crypto.createHmac("sha256", API_KEY).update(bodyStr).digest("hex");

  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", sig)
    .send(bodyStr);
  expect(res.status).toBe(200);
});

// ─── Part B: GET /stats ────────────────────────────────────────────────────

test("GET /stats — returns correct shape with zero values", async () => {
  const res = await request(app).get("/stats");
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    sent: expect.any(Number),
    failed: expect.any(Number),
    queued: expect.any(Number),
    duplicates_blocked: expect.any(Number),
  });
});

test("GET /stats — queued increments when job is created", async () => {
  await Rule.create({ keyword: "STATS", dmMessage: "Stats msg" });
  await sendWebhook({
    event_id: "evt_stats_q",
    event_type: "comment.created",
    data: { comment_id: "c_sq", text: "STATS please", from: { user_id: "u_sq" } },
  });

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();

  const res = await request(app).get("/stats");
  expect(res.status).toBe(200);
  expect(res.body.queued).toBeGreaterThanOrEqual(1);
});

test("GET /stats — sent increments when job reaches delivered", async () => {
  // Directly create a delivered job to test counter
  await DMJob.create({
    ruleId: "000000000000000000000099",
    recipientUserId: "u_delivered",
    message: "hi",
    status: "delivered",
    dmId: "dm_delivered",
  });

  const res = await request(app).get("/stats");
  expect(res.status).toBe(200);
  expect(res.body.sent).toBeGreaterThanOrEqual(1);
});

test("GET /stats — failed increments when job is failed", async () => {
  await DMJob.create({
    ruleId: "000000000000000000000098",
    recipientUserId: "u_failed",
    message: "hi",
    status: "failed",
    lastError: "status_500",
  });

  const res = await request(app).get("/stats");
  expect(res.status).toBe(200);
  expect(res.body.failed).toBeGreaterThanOrEqual(1);
});

test("GET /stats — duplicates_blocked increments on duplicate prevention", async () => {
  await Rule.create({ keyword: "DUP", dmMessage: "Dup msg" });

  // First comment — creates delivery
  await sendWebhook({
    event_id: "evt_dup_s1",
    event_type: "comment.created",
    data: { comment_id: "c_ds1", text: "DUP here", from: { user_id: "u_dup_stats" } },
  });
  // Second comment from same user — duplicate
  await sendWebhook({
    event_id: "evt_dup_s2",
    event_type: "comment.created",
    data: { comment_id: "c_ds2", text: "DUP again", from: { user_id: "u_dup_stats" } },
  });

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();

  const res = await request(app).get("/stats");
  expect(res.status).toBe(200);
  expect(res.body.duplicates_blocked).toBeGreaterThanOrEqual(1);
});

test("GET /stats — accepted jobs count as queued (in-flight, not yet confirmed)", async () => {
  await DMJob.create({
    ruleId: "000000000000000000000097",
    recipientUserId: "u_accepted",
    message: "hi",
    status: "accepted",
    dmId: "dm_inflight",
  });

  const res = await request(app).get("/stats");
  expect(res.status).toBe(200);
  // accepted counts toward queued (still in-flight)
  expect(res.body.queued).toBeGreaterThanOrEqual(1);
  // must NOT count as sent
  expect(res.body.sent).toBe(0);
});

// ─── GET /rules ────────────────────────────────────────────────────────────

test("GET /rules returns active rules with correct shape", async () => {
  await Rule.create({ keyword: "TEST_R1", dmMessage: "Msg 1" });
  await Rule.create({ keyword: "TEST_R2", dmMessage: "Msg 2" });

  const res = await request(app).get("/rules");
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(2);
  expect(res.body[0]).toMatchObject({
    rule_id: expect.any(String),
    keyword: expect.any(String),
    dm_message: expect.any(String),
  });
});

// ─── /debug/trigger-webhook ────────────────────────────────────────────────

test("POST /debug/trigger-webhook — creates job via direct DB path", async () => {
  await Rule.create({ keyword: "DEBUG_KEY", dmMessage: "Got it" });
  const payload = {
    event_type: "comment.created",
    data: { comment_id: "c_debug", text: "please DEBUG_KEY now", from: { user_id: "u_debug" } },
  };

  const res = await request(app).post("/debug/trigger-webhook").send(payload);
  expect(res.status).toBe(200);

  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();

  const jobs = await DMJob.find({ recipientUserId: "u_debug" });
  expect(jobs.length).toBe(1);
  expect(jobs[0].message).toBe("Got it");
});
