const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");

const Rule = require("./models/Rule");
const WebhookEvent = require("./models/WebhookEvent");
const DMJob = require("./models/DMJob");
const { verifySignature } = require("./utils/signature");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post(
  "/webhook",
  express.raw({ type: "application/json", limit: "256kb" }),
  async (req, res) => {
    const rawBody = req.body;
    const bodyText = rawBody.toString();

    const signature = req.headers["x-pseudogram-signature"];

    const verifyEnabled =
      (process.env.WEBHOOK_VERIFY_SIGNATURE || "true") === "true";

    if (verifyEnabled) {
      const ok = verifySignature(
        bodyText,
        signature,
        process.env.PSEUDOGRAM_API_KEY || "",
      );

      if (!ok) {
        return res.status(401).json({ error: "invalid_signature" });
      }
    }

    let payload;

    try {
      payload = JSON.parse(bodyText);
    } catch (err) {
      return res.status(400).json({ error: "invalid_json" });
    }

    const eventId = payload.event_id || payload.eventId || null;

    if (!eventId) {
      return res.status(400).json({ error: "missing_event_id" });
    }

    try {
      await WebhookEvent.create({
        eventId,
        eventType: payload.event_type || payload.eventType,
        payload,
        receivedAt: new Date(),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(200).send("OK");
      }

      console.error("persist event error", err);
      return res.status(500).json({ error: "internal_error" });
    }

    res.status(200).send("OK");

    (async () => {
      try {
        const eventType = payload.event_type || payload.eventType;

        if (eventType === "comment.deleted") {
          await WebhookEvent.updateOne(
            { eventId },
            { $set: { deleted: true } },
          );
          return;
        }

        if (eventType !== "comment.created") {
          return;
        }

        const data = payload.data || {};
        const text = String(data.text || "");
        const commentId = data.comment_id || data.commentId;

        const user = data.from || {};
        const recipientUserId = user.user_id || user.userId;

        if (!recipientUserId) {
          return;
        }

        const rules = await Rule.find({ active: true }).lean();

        console.log("RULE CHECK", {
          eventId,
          text,
          rules: rules.map((r) => ({
            id: r._id.toString(),
            keyword: r.keyword,
            active: r.active,
          })),
        });

        const { createDeliveryAndJobAtomic } = require("./services/processor");

        for (const rule of rules) {
          if (!rule.keyword) continue;

          if (text.toLowerCase().includes(rule.keyword.toLowerCase())) {
            console.log("MATCHED RULE", {
              ruleId: rule._id.toString(),
              keyword: rule.keyword,
              text,
              recipientUserId,
              eventId,
            });
            try {
              await createDeliveryAndJobAtomic({
                ruleId: rule._id,
                recipientUserId,
                eventId,
                commentId,
                message: rule.dmMessage,
              });
            } catch (err) {
              console.error("enqueue error", err);
            }
          }
        }

        await WebhookEvent.updateOne(
          { eventId },
          { $set: { processed: true, processedAt: new Date() } },
        ).catch((e) => console.error("mark processed error", e));
      } catch (err) {
        console.error("async processing error", err);
      }
    })();
  },
);

app.use(express.json({ limit: "256kb" }));

app.post("/rules", async (req, res) => {
  try {
    const { keyword, dm_message } = req.body || {};

    if (!keyword || !dm_message) {
      return res.status(400).json({
        error: "keyword and dm_message required",
      });
    }

    const r = await Rule.create({
      keyword,
      dmMessage: dm_message,
    });

    res.status(201).json({
      rule_id: r._id.toString(),
      keyword: r.keyword,
      dm_message: r.dmMessage,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "internal_error",
      message: err.message,
    });
  }
});

app.get("/stats", async (_req, res) => {
  try {
    const sent = await DMJob.countDocuments({ status: "delivered" });

    const failed = await DMJob.countDocuments({ status: "failed" });

    const queued = await DMJob.countDocuments({
      status: { $in: ["queued", "processing", "accepted"] },
    });

    const db = mongoose.connection.db;
    const statsDoc = db
      ? await db.collection("stats").findOne({ _id: "global" })
      : null;
    const duplicates_blocked = statsDoc ? statsDoc.duplicates_blocked || 0 : 0;

    res.json({ sent, failed, queued, duplicates_blocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/debug/jobs", async (_req, res) => {
  try {
    const queued = await DMJob.countDocuments({ status: "queued" });
    const processing = await DMJob.countDocuments({ status: "processing" });
    const accepted = await DMJob.countDocuments({ status: "accepted" });
    const delivered = await DMJob.countDocuments({ status: "delivered" });
    const failed = await DMJob.countDocuments({ status: "failed" });

    const oldestQueued = await DMJob.findOne({ status: "queued" })
      .sort({ nextAttemptAt: 1 })
      .lean();
    const oldestAccepted = await DMJob.findOne({ status: "accepted" })
      .sort({ updatedAt: 1 })
      .lean();
    const oldestProcessing = await DMJob.findOne({ status: "processing" })
      .sort({ processingStartedAt: 1 })
      .lean();

    res.json({
      queued,
      processing,
      accepted,
      delivered,
      failed,
      oldestQueued: oldestQueued ? { jobId: oldestQueued._id.toString(), nextAttemptAt: oldestQueued.nextAttemptAt } : null,
      oldestAccepted: oldestAccepted ? { jobId: oldestAccepted._id.toString(), updatedAt: oldestAccepted.updatedAt } : null,
      oldestProcessing: oldestProcessing ? { jobId: oldestProcessing._id.toString(), processingStartedAt: oldestProcessing.processingStartedAt } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

module.exports = app;
