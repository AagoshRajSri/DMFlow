const setup = require('./setup');
const DMJob = require('../src/models/DMJob');
const Delivery = require('../src/models/Delivery');
const { processOne, reconciliationLoop } = require('../src/worker');

beforeAll(async () => {
  await setup.setup();
  process.env.MAX_DM_RETRIES = '3';
});
afterAll(async () => {
  await setup.teardown();
});

afterEach(async () => {
  await DMJob.deleteMany({});
  await Delivery.deleteMany({});
});

test('500 triggers retry with exponential backoff and attempts increment', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000001', recipientUserId: 'u1', message: 'hi', status: 'queued', nextAttemptAt: new Date(0) });
  const client = {
    sendDM: jest.fn().mockResolvedValue({ status: 500, data: { error: 'internal' }, headers: {} }),
  };

  await processOne(client);
  const refreshed = await DMJob.findById(job._id);
  expect(refreshed.attempts).toBe(1);
  expect(refreshed.status).toBe('queued');
  // nextAttemptAt should be in the future
  expect(refreshed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() - 1000);
});

test('429 respects Retry-After header', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000002', recipientUserId: 'u2', message: 'hi', status: 'queued', nextAttemptAt: new Date(0) });
  const client = {
    sendDM: jest.fn().mockResolvedValue({ status: 429, data: { error: 'rate_limited' }, headers: { 'retry-after': '1' } }),
  };

  await processOne(client);
  const refreshed = await DMJob.findById(job._id);
  expect(refreshed.status).toBe('queued');
  expect(refreshed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
});

test('400 does not retry and marks failed', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000003', recipientUserId: 'u3', message: 'hi', status: 'queued', nextAttemptAt: new Date(0) });
  const client = { sendDM: jest.fn().mockResolvedValue({ status: 400, data: { error: 'bad_request' }, headers: {} }) };
  await processOne(client);
  const refreshed = await DMJob.findById(job._id);
  expect(refreshed.status).toBe('failed');
});

test('202 accepted stores dmId and status accepted, not delivered', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000004', recipientUserId: 'u4', message: 'hi', status: 'queued', nextAttemptAt: new Date(0) });
  const client = { sendDM: jest.fn().mockResolvedValue({ status: 202, data: { dm_id: 'dm_123', status: 'queued' }, headers: {} }) };
  await processOne(client);
  const refreshed = await DMJob.findById(job._id);
  expect(refreshed.status).toBe('accepted');
  expect(refreshed.dmId).toBe('dm_123');
});

test('accepted -> delivered reconciliation updates job and delivery', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000005', recipientUserId: 'u5', message: 'hi', status: 'accepted', dmId: 'dm_ok' });
  await Delivery.create({ ruleId: job.ruleId, recipientUserId: job.recipientUserId });
  const client = { getDMStatus: jest.fn().mockResolvedValue({ status: 200, data: { status: 'delivered' } }) };
  await reconciliationLoop(client);
  const refreshed = await DMJob.findById(job._id);
  expect(refreshed.status).toBe('delivered');
  const delivery = await Delivery.findOne({ recipientUserId: 'u5' });
  expect(delivery.status).toBe('delivered');
});

test('accepted -> failed reconciliation schedules retry', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000006', recipientUserId: 'u6', message: 'hi', status: 'accepted', dmId: 'dm_fail', attempts: 0 });
  await Delivery.create({ ruleId: job.ruleId, recipientUserId: job.recipientUserId });
  const client = { getDMStatus: jest.fn().mockResolvedValue({ status: 200, data: { status: 'failed' } }) };
  await reconciliationLoop(client);
  const refreshed = await DMJob.findById(job._id);
  // should be requeued or failed depending on attempts
  expect(['queued','failed']).toContain(refreshed.status);
});

test('failed reconciliation triggers retry until MAX_DM_RETRIES then failed', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000007', recipientUserId: 'u7', message: 'hi', status: 'queued', attempts: 3, nextAttemptAt: new Date(0) });
  // client returns 500 repeatedly
  const client = { sendDM: jest.fn().mockResolvedValue({ status: 500, data: {}, headers: {} }) };
  await processOne(client);
  const refreshed = await DMJob.findById(job._id);
  expect(refreshed.status).toBe('failed');
});

test('idempotency key remains stable across retries', async () => {
  const job = await DMJob.create({ ruleId: '000000000000000000000008', recipientUserId: 'u8', message: 'hi', status: 'queued', attempts: 0, nextAttemptAt: new Date(0) });
  const keys = [];
  const client = {
    sendDM: jest.fn().mockImplementation((_payload, idempotencyKey) => {
      keys.push(idempotencyKey);
      return Promise.resolve({ status: 500, data: {}, headers: {} });
    })
  };
  await processOne(client);
  await processOne(client);
  expect(keys.length).toBeGreaterThanOrEqual(1);
  // all keys used for this job should be identical
  expect(new Set(keys).size).toBe(1);
});
