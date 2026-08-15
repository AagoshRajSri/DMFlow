const request = require("supertest");
const app = require("../src/app");
const setup = require("./setup");
const Rule = require("../src/models/Rule");
const WebhookEvent = require("../src/models/WebhookEvent");
const DMJob = require("../src/models/DMJob");
const Delivery = require("../src/models/Delivery");

beforeAll(async () => {
  process.env.PSEUDOGRAM_API_KEY = "testkey";
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
});

test("create rule", async () => {
  const res = await request(app)
    .post("/rules")
    .send({ keyword: "PRICE", dm_message: "Here" });
  expect(res.status).toBe(201);
  expect(res.body.rule_id).toBeDefined();
});

test("webhook creates one DM job", async () => {
  const rule = await Rule.create({ keyword: "PRICE", dmMessage: "price here" });
  const payload = {
    event_id: "evt_1",
    event_type: "comment.created",
    data: {
      comment_id: "c1",
      text: "Can I get the price?",
      created_at: new Date().toISOString(),
      from: { user_id: "usr_1" },
    },
  };

  // sign payload
  const crypto = require("crypto");
  const sig = crypto
    .createHmac("sha256", process.env.PSEUDOGRAM_API_KEY)
    .update(JSON.stringify(payload))
    .digest("hex");
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=" + sig)
    .send(JSON.stringify(payload));
  expect(res.status).toBe(200);

  // trigger background processing (tests don't run index startup)
  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "usr_1" });
  expect(jobs.length).toBe(1);
});

test("duplicate event id is ignored", async () => {
  const payload = {
    event_id: "evt_dup",
    event_type: "comment.created",
    data: { comment_id: "cdup", text: "PRICE", from: { user_id: "usr_dup" } },
  };
  const crypto = require("crypto");
  const sig = crypto
    .createHmac("sha256", process.env.PSEUDOGRAM_API_KEY)
    .update(JSON.stringify(payload))
    .digest("hex");
  const res1 = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=" + sig)
    .send(JSON.stringify(payload));
  expect(res1.status).toBe(200);
  const res2 = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=" + sig)
    .send(JSON.stringify(payload));
  expect(res2.status).toBe(200);
  const events = await WebhookEvent.find({ eventId: "evt_dup" });
  expect(events.length).toBe(1);
});

test("same user multiple comments => one delivery", async () => {
  const rule = await Rule.create({ keyword: "PRICE", dmMessage: "Here" });
  const payload1 = {
    event_id: "evt_a1",
    event_type: "comment.created",
    data: {
      comment_id: "c_a1",
      text: "price pls",
      from: { user_id: "u_multi" },
    },
  };
  const payload2 = {
    event_id: "evt_a2",
    event_type: "comment.created",
    data: {
      comment_id: "c_a2",
      text: "PRICE again",
      from: { user_id: "u_multi" },
    },
  };
  const crypto = require("crypto");
  const sig1 = crypto
    .createHmac("sha256", process.env.PSEUDOGRAM_API_KEY)
    .update(JSON.stringify(payload1))
    .digest("hex");
  const sig2 = crypto
    .createHmac("sha256", process.env.PSEUDOGRAM_API_KEY)
    .update(JSON.stringify(payload2))
    .digest("hex");
  await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=" + sig1)
    .send(JSON.stringify(payload1));
  await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=" + sig2)
    .send(JSON.stringify(payload2));
  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const deliveries = await Delivery.find({ recipientUserId: "u_multi" });
  expect(deliveries.length).toBe(1);
});

test("invalid signature rejected", async () => {
  const payload = {
    event_id: "evt_bad",
    event_type: "comment.created",
    data: { comment_id: "cbad", text: "PRICE", from: { user_id: "u_bad" } },
  };
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=wrongsig")
    .send(payload);
  expect(res.status).toBe(401);
});

test("comment.deleted prevents DM", async () => {
  const rule = await Rule.create({ keyword: "PRICE", dmMessage: "Here" });
  const payload = {
    event_id: "evt_del",
    event_type: "comment.deleted",
    data: { comment_id: "c_del", text: "PRICE", from: { user_id: "u_del" } },
  };
  const crypto = require("crypto");
  const sig = crypto
    .createHmac("sha256", process.env.PSEUDOGRAM_API_KEY)
    .update(JSON.stringify(payload))
    .digest("hex");
  const res = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("X-PseudoGram-Signature", "sha256=" + sig)
    .send(JSON.stringify(payload));
  expect(res.status).toBe(200);
  const { processPendingWebhookEvents } = require("../src/services/processor");
  await processPendingWebhookEvents();
  const jobs = await DMJob.find({ recipientUserId: "u_del" });
  expect(jobs.length).toBe(0);
});

test("process pending webhook events on demand (recovery)", async () => {
  const rule = await Rule.create({ keyword: "RECOV", dmMessage: "Recovered" });
  // insert a persisted webhook event that wasn't processed
  await WebhookEvent.create({
    eventId: "evt_recover",
    eventType: "comment.created",
    payload: {
      event_type: "comment.created",
      data: {
        comment_id: "c_recover",
        text: "please RECOV",
        from: { user_id: "u_recov" },
      },
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
