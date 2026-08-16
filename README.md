# 🚀 DMFlow (LinkPlease) — Instagram Automation Engine

DMFlow is an Instagram Creator Studio automation simulator. It is built to show how modern backend architectures handle comment-to-DM triggers (e.g., commenting `"INFO"` on a post automatically triggers an automated Direct Message).

This project is a full-stack JavaScript application:
*   **Backend**: Node.js, Express, MongoDB (Mongoose), and Bottleneck.
*   **Frontend**: Vite, React, and CSS animations.

---

## 🎓 What You Can Learn From This Project

This codebase serves as an educational blueprint for building resilient, production-ready backend systems. Here are the core concepts you can learn:

### 1. Webhooks & Asynchronous Processing
*   **The Concept**: A Webhook is an HTTP callback. Instead of polling an external service continuously, the external service (e.g., PseudoGram) calls our `/webhook` endpoint whenever an event (like a comment being created) occurs.
*   **The Pattern**: In `app.js`, we immediately return an HTTP `200 OK` response to the sender before kicking off the rule matching and DM processing. This keeps our webhook endpoint fast, responsive, and resilient to timeouts.

### 2. Double-Tier Idempotency (Deduplication)
If a network hiccup occurs, webhook senders will retry. Without deduplication, we would send multiple duplicate DMs to the same user. We solve this at two levels:
*   **Webhook Deduplication**: We store incoming event IDs in a `WebhookEvent` collection with a `unique` index. If we see the same event ID twice, we discard it.
*   **User Deduplication**: We enforce a compound unique index in MongoDB on `Delivery(ruleId + recipientUserId)`. A user can only trigger a specific automation once, preventing DM spam.

### 3. Outbound Rate Limiting & Transient Failure Retries
*   **Rate Limiting**: High-volume systems must respect the recipient API's rate limits. We use **Bottleneck** to limit outgoing DMs to a maximum of 10 requests per 60 seconds.
*   **Exponential Backoff**: If the API returns `500 Server Error`, we retry with increasing delays (`500ms * 2^attempts`) plus random jitter to avoid overwhelming the server.

### 4. HMAC-SHA256 Signature Verification
*   To prevent attackers from sending fake webhook requests to our endpoint, we verify the `X-PseudoGram-Signature` header. We calculate the HMAC of the raw request body using our secret API key and perform a timing-safe comparison to prevent timing attacks.

---

## 🛠️ Tech Stack & Architecture

```
User Comment ➔ Webhook POST ➔ Express App ➔ MongoDB (WebhookEvent)
                                                 │
                                                 ▼
Outbound Client ➔ Bottleneck Limiter ➔ Worker Loop (Claims queued DMJobs)
```

---

## 🚦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
Create a `.env` file in the root of the project:
```env
MONGODB_URI=your_mongodb_uri
PSEUDOGRAM_API_KEY=your_secret_key
WEBHOOK_VERIFY_SIGNATURE=true
```

### 3. Run the Application
*   **Backend**: `npm run start` or `node backend/src/index.js`
*   **Frontend**: `npm run dev` in the frontend directory

### 4. Run Automated Tests
Execute the suite of 15 Jest tests covering webhook deduplication, signature checks, and rate-limiting:
```bash
npm test
```

---

## 🧪 Testing with cURL

You can manually trigger the webhook to test the backend locally:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt_test_123",
    "event_type": "comment.created",
    "data": {
      "comment_id": "cmt_456",
      "text": "Send me the link!",
      "from": {
        "user_id": "usr_999",
        "username": "coder_john"
      }
    }
  }'
```
*(Make sure to set `WEBHOOK_VERIFY_SIGNATURE=false` in your `.env` when sending unsigned local requests.)*
