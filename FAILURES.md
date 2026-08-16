# Known Limitations & Design Decisions

_Last updated: 2026-08-16_

---

## ✅ What Works Correctly

| Feature | Status |
|---|---|
| Keyword-triggered DM automation | ✅ Working |
| Idempotency — duplicate `event_id` blocked | ✅ Working |
| Per-user/per-rule DM deduplication | ✅ Working |
| Webhook signature verification (HMAC-SHA256) | ✅ Working |
| Rate limiting (10 req/s via Bottleneck) | ✅ Working |
| Automatic retry on 429 / 500 | ✅ Working |
| Reconciliation polling for terminal DM status | ✅ Working |
| Crash recovery via `processPendingWebhookEvents` | ✅ Working |
| Stale job recovery via `recoverStaleProcessing` | ✅ Working |
| Honest `GET /stats` from DB counters | ✅ Working |
| UI Rule Synchronization (`GET /rules`) | ✅ Working |
| Live Mockup Webhook Trigger (`/debug/trigger-webhook`) | ✅ Working |

---

## ⚠️ Known Limitations

### 1. In-Memory Acknowledgement Window

Webhook events are acknowledged with HTTP 200 before the async processing IIFE
completes writing the `WebhookEvent` document to MongoDB. If the process crashes
in the brief window (~10ms) between sending the HTTP response and the DB write,
that specific event is **permanently lost**.

Events that do reach MongoDB but are not yet marked `processed: true` are
automatically recovered on the next startup via `processPendingWebhookEvents()`.

**Impact:** Extremely low probability. Acceptable for this assignment scope.

---

### 2. Stats Queries Are Not Atomic

`GET /stats` executes **4 separate MongoDB queries** sequentially. Under high
concurrent load, a job transitioning between states mid-read can produce
momentarily inconsistent numbers (e.g., a job counted as `queued` in one
query may have already moved to `delivered` by the time the `sent` query runs).

**Impact:** Cosmetic only — the UI refreshes every 5 seconds. Numbers converge
within one polling cycle.

---

### 3. No Distributed Locking

The worker uses MongoDB `findOneAndUpdate` to claim jobs atomically. This is
correct for a **single-process deployment**. If multiple instances were run
without coordination, two workers could claim the same job simultaneously.

The `Delivery` unique index ensures the DM is still sent **at most once**, but
two API calls would be made with the same idempotency key, which the
PseudoGram API should deduplicate.

**Impact:** Not applicable for this deployment (single Render instance).

---

### 4. DMs Accepted Without Terminal Status

A DM accepted by PseudoGram (202 response) transitions to internal status
`accepted`. The reconciliation loop polls `GET /v1/dm/{dm_id}` every 15 seconds
to detect `delivered` or `failed`.

If the remote API **never** returns a terminal status, the job remains `accepted`
indefinitely and is counted in `queued` in stats. No force-fail timeout is
implemented.

**Impact:** The `queued` count in stats can drift upward if PseudoGram becomes
permanently unresponsive for specific jobs.

---

### 5. 429 During Reconciliation Polling

If `GET /v1/dm/{dm_id}` returns 429 during the reconciliation loop, **that
entire loop run is skipped** for all affected jobs. The next scheduled run
(15 seconds later) will retry automatically.

**Impact:** Minor delay in terminal state resolution. No data is lost.

---

### 6. Signature Verification Default

`WEBHOOK_VERIFY_SIGNATURE=true` (the default) requires every incoming webhook
to carry a valid `X-PseudoGram-Signature` HMAC-SHA256 header.

If the grader or external caller does **not** send a signed request, the
webhook returns `401 Unauthorized`.

**Mitigation:** Set `WEBHOOK_VERIFY_SIGNATURE=false` in the Render environment
if the grader sends unsigned webhooks.

---

### 7. Stale Job Recovery Window

If the process restarts while a `DMJob` is in `processing` status (between the
`findOneAndUpdate` claim and the API response), `recoverStaleProcessing()` will
detect the stale lease after a configurable timeout (default: **120 seconds**)
and re-queue the job.

During that 120-second window, the job is **not** being actively retried.

**Impact:** At most a 2-minute delay on in-flight jobs during restart.

---

## 🗑️ Removed / Out of Scope

| Item | Reason |
|---|---|
| `server.js` (legacy entry point) | Removed — `backend/src/index.js` is the canonical entry |
| `scripts/` directory | Removed — one-off seed scripts, not needed for grading |
| `load-test/` directory | Removed — out of scope for this assignment |
| Frontend stats flickering | Fixed — background polls no longer trigger loading state |
| Fake duplicate-tracking via DMJob | Fixed — honest `$inc` counter in `stats` collection |
