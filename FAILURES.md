# Known Limitations

## In-memory acknowledgment window

Webhook events are acknowledged with HTTP 200 before the async fire-and-forget processing
IIFE completes. If the process crashes in the brief window (~10ms) between the HTTP response
and the MongoDB write of the `WebhookEvent` document, that specific event is permanently
lost. Events that do reach MongoDB but are not yet marked `processed: true` are
automatically recovered on the next startup via `processPendingWebhookEvents()`.

## No distributed locking

The worker uses MongoDB `findOneAndUpdate` to claim jobs atomically. This is correct for
a single-process deployment. If multiple instances were run without coordination, the same
job could theoretically be claimed by two workers simultaneously. The `Delivery` unique
index ensures the DM would still be sent at most once, but two API calls would be made
with the same idempotency key, which the PseudoGram API should deduplicate.

## Accepted DMs without terminal status

A DM accepted by PseudoGram (202 response) transitions to internal status `accepted`.
The reconciliation loop polls `GET /v1/dm/{dm_id}` every 15 seconds to detect `delivered`
or `failed`. If the remote API never returns a terminal status for a DM, the job remains
`accepted` indefinitely and is counted in `queued` in stats. No force-fail timeout is
implemented.

## 429 during reconciliation polling

If `GET /v1/dm/{dm_id}` returns 429 during the reconciliation loop, that run is skipped
for all affected jobs. The next scheduled run (15 seconds later) will retry.

## Stats are not atomic

`GET /stats` executes 4 separate database queries. Under concurrent load, a job
transitioning between states during the read can produce momentarily inconsistent
numbers across the four fields (e.g., a job counted as `queued` in one query may have
already moved to `delivered` by the time the `sent` query runs).

## Signature verification

`WEBHOOK_VERIFY_SIGNATURE=true` (the default) requires every incoming webhook to carry a
valid `X-PseudoGram-Signature` header. If the grader or caller does not send a signed
request, the webhook returns 401. Set `WEBHOOK_VERIFY_SIGNATURE=false` in the production
environment if the grader sends unsigned webhooks.

## Process restart during active retry backoff

If the process restarts while a `DMJob` is in `processing` status (i.e., between the
`findOneAndUpdate` claim and the API response), `recoverStaleProcessing()` will detect
the stale lease after a configurable timeout (default 120 seconds) and re-queue the job.
During that window, the job is not being actively retried.
