# LinkPlease — Backend

Short summary: LinkPlease is a webhook-to-DM delivery service built as the backend part of the LinkPlease assignment. It accepts incoming webhook events, deduplicates and persists them, matches active rules, enqueues persistent DM jobs, rate-limits outbound requests to PseudoGram, retries transient failures, and reconciles delivery state.

**Project overview**
- **Purpose:** deliver rule-triggered direct messages (DMs) based on incoming comment webhooks.
- **Stack:** MERN-style backend components (Node.js / Express, MongoDB via Mongoose). The frontend/dashboard is out of scope for this README.

**Assignment context**
- This repository implements the LinkPlease backend assignment requirements: `POST /webhook`, `POST /rules`, `GET /stats` and the production behaviors described in the assignment (event deduplication, DB-level delivery uniqueness, deterministic idempotency keys, rate-limiting, 429/500 handling, reconciliation, restart recovery, HMAC verification of raw body, persistent queue, and automated tests).

**Architecture & data flow**
- **Ingress:** `POST /webhook` accepts raw JSON webhooks and verifies HMAC signature (when enabled). Events are persisted to the `WebhookEvent` collection.
- **Background processing:** a persistent job queue (`DMJob`) is created from matched rules by the background processor (`processPendingWebhookEvents` / worker loops). This separates immediate response from work and enables restart recovery.
- **Outbound:** `PseudoGramClient` sends DMs with a deterministic `Idempotency-Key`. A Bottleneck limiter enforces the outbound rate limit.
- **Reconciliation:** accepted-but-not-yet-delivered items are reconciled by polling `getDMStatus()` and updating `Delivery` and `DMJob` records accordingly.

**Primary repository files**
- **App entry:** [backend/src/app.js](backend/src/app.js#L1)
- **Processing logic:** [backend/src/services/processor.js](backend/src/services/processor.js#L1)
- **Worker + rate limiter:** [backend/src/worker.js](backend/src/worker.js#L1)
- **PseudoGram client:** [backend/src/pseudogramClient.js](backend/src/pseudogramClient.js#L1)
- **Persistent job model:** [backend/src/models/DMJob.js](backend/src/models/DMJob.js#L1)
- **Tests:** [backend/tests](backend/tests)

**Required API endpoints**
- `POST /webhook` — Receiver for PseudoGram webhooks
  - Request: raw JSON body (exact bytes used for HMAC). Example headers: `Content-Type: application/json`, `X-PseudoGram-Signature: sha256=<hex>`
  - Response: `200 OK` on successful persist or duplicate, `401` for signature failure, `500` for internal error.
- `POST /rules` — Create a matching rule
  - Request JSON: `{ "keyword": "PRICE", "dm_message": "Your message here" }`
  - Response: `201 Created` with `{ rule_id: "<id>" }` on success.
- `GET /stats` — Aggregated counters
  - Response JSON example: `{ "sent": 123, "failed": 5, "queued": 10, "duplicates_blocked": 2 }`.

**Webhook HMAC verification**
- The server verifies an HMAC-SHA256 signature over the raw request body when `WEBHOOK_VERIFY_SIGNATURE=true` using the `PSEUDOGRAM_API_KEY` as the secret (this repo uses that same secret by convention in tests). The header used is `X-PseudoGram-Signature` with prefix `sha256=`. The server uses a timing-safe comparison.
- Important: the raw bytes must be preserved (the middleware reads raw body before JSON parsing). Tests and clients must sign the exact bytes sent.

**Event deduplication**
- Incoming events are persisted to `WebhookEvent` with a unique `eventId` index. Duplicate `eventId` inserts are ignored and return `200 OK` so senders may safely retry.

**Rule + user-level DM deduplication**
- Deliveries are recorded in `Delivery` with a compound unique index on `{ ruleId, recipientUserId }`. This prevents creating multiple deliveries for the same rule and recipient even if multiple matching events arrive.

**Persistent MongoDB queue**
- `DMJob` is the persistent job queue. Jobs have `status` (queued, processing, accepted, delivered, failed), `attempts`, `nextAttemptAt`, and `dmId` when accepted. Workers claim jobs with an atomic `findOneAndUpdate` and update the DB with results so queued work survives restarts.

**Retry strategy (500 and 429)**
- For 5xx responses and network errors, the worker schedules exponential backoff with jitter and retries until `MAX_DM_RETRIES` (default `5`). When the PseudoGram API returns `429`, the worker honors the `Retry-After` header when present (seconds) and otherwise falls back to a default wait.

**Rate limiting**
- Outbound DM sends are rate-limited to `10` requests per `60` seconds using `bottleneck` reservoir configuration to comply with the assignment constraint.

**Idempotency-Key strategy**
- The idempotency key used for outbound DMs is deterministic: ``<ruleId>:<recipientUserId>``. This ensures retries for the same (rule,recipient) are idempotent at PseudoGram and minimizes duplicate deliveries when PseudoGram implements idempotency semantics.

**202 Accepted vs actual delivery**
- PseudoGram may respond `202 Accepted` to indicate the request is accepted for processing, not that delivery has completed. The worker marks the job `accepted` and stores the returned `dmId` (if provided).
- Delivery is considered final only after reconciliation indicates `delivered` (via `getDMStatus`) or after retries/exhaustion cause `failed` status.

**Delivery reconciliation**
- A periodic reconciliation loop calls `getDMStatus(dmId)` for `accepted` jobs and transitions jobs to `delivered`/`queued`/`failed` as appropriate. This decouples initial acceptance from final delivery confirmation.

**comment.deleted handling**
- When a `comment.deleted` event is received the persisted `WebhookEvent` is marked `deleted`. Background processing skips creating DM jobs for events flagged deleted. This prevents sending DMs for comments that have been removed.

**Restart recovery**
- On startup the background processor calls `processPendingWebhookEvents()` to pick up any persisted, unprocessed `WebhookEvent` records and create `DMJob` entries as needed. `DMJob` persistence ensures work continues across restarts.

**`/stats` behavior**
- `GET /stats` aggregates counts from `DMJob` and `Delivery` to report sent/delivered, failed, queued, and duplicates blocked.

**Testing**
- Local test run (actual result):

```
$ npm test

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
```

- Notes on tests:
  - Tests run locally use `mongodb-memory-server` and a mocked `PseudoGramClient` for outbound behavior; they do not require calling the real PseudoGram API.
  - Tests validate HMAC handling, deduplication, job enqueueing, retry/reconciliation logic (mocked), and worker behavior.

**Local setup**
- Install dependencies:

```bash
npm install
```
- Run tests:

```bash
npm test
```
- Run dev server (example):

```bash
PORT=3000 MONGO_URI='mongodb://localhost:27017/linkplease' PSEUDOGRAM_API_KEY='yourkey' node backend/src/app.js
```

**Environment variables**
- `MONGO_URI` — MongoDB connection URI (default: local when not set in tests).
- `PORT` — HTTP port.
- `PSEUDOGRAM_API_KEY` — API key used for PseudoGram; also used as HMAC secret in this implementation when `WEBHOOK_VERIFY_SIGNATURE=true`.
- `PSEUDOGRAM_BASE_URL` — Base URL for PseudoGram (defaults to the sample test URL).
- `WEBHOOK_VERIFY_SIGNATURE` — `true`/`false` to enable/disable HMAC verification of webhooks.
- `MAX_DM_RETRIES` — Number of retry attempts for 5xx/network errors (default `5`).

**Render deployment**
- This repo includes a `render.yaml` example for deploying the backend to Render. On Render, set the environment variables above (particularly `MONGO_URI` and `PSEUDOGRAM_API_KEY`) in the service settings. The service should be configured to start the Node process that runs the server.

**500-event load testing instructions**
- A load test helper exists at `backend/load-test/send-500.js` which will POST 500 webhooks to the server for local stress testing.
- To run (example):

```bash
# ensure service is running locally on the expected host:port
node backend/load-test/send-500.js http://localhost:3000
```
- Important: I have not executed the 500-event load test as part of the local test run reported above; run it yourself if you want to observe behavior under higher load. Watch `GET /stats` while the load test runs to observe queued/attempts counters.

**Known limitations & honesty notes**
- The test-suite uses a mocked `PseudoGramClient` and `mongodb-memory-server` for speed and determinism. Behavior against the real PseudoGram API may vary (network, idempotency semantics, header formats).
- Because external delivery finalization depends on the remote provider and network timing, this implementation does not claim strict exactly-once delivery; it aims for practical at-most-once per `(ruleId, recipientUserId)` via the DB unique index and idempotency keys, plus retries and reconciliation.
- The repository contains fallback behavior when MongoDB transactions are unavailable (e.g., single-node in-memory server). For production, a replica-set-enabled MongoDB is recommended to enable true multi-document transactions.
- The 500-event load test is provided but was not executed as part of the verified test output above — please run it in your environment if you want to validate scalability.

If you'd like, I can:
- add a brief `README` section that contains sample `curl` commands for each endpoint; or
- run the 500-event load test in this environment and report the observed `/stats` over time.

---
Updated: August 15, 2026
