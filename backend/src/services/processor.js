const mongoose = require("mongoose");
const Rule = require("../models/Rule");
const WebhookEvent = require("../models/WebhookEvent");
const Delivery = require("../models/Delivery");
const DMJob = require("../models/DMJob");

async function incrementDuplicatesBlocked() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    await db.collection("stats").updateOne(
      { _id: "global" },
      { $inc: { duplicates_blocked: 1 } },
      { upsert: true },
    );
  } catch (e) {
    console.error("incrementDuplicatesBlocked error", e && e.message ? e.message : e);
  }
}

async function createDeliveryAndJobAtomic({
  ruleId,
  recipientUserId,
  eventId,
  commentId,
  message,
}) {
  const idempotencyKey = `${ruleId.toString()}:${recipientUserId}`;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Delivery.create([{ ruleId, recipientUserId }], { session });
      await DMJob.create(
        [
          {
            ruleId,
            eventId,
            commentId,
            recipientUserId,
            idempotencyKey,
            message,
            status: "queued",
            attempts: 0,
            nextAttemptAt: new Date(),
          },
        ],
        { session },
      );
    });
    session.endSession();
    return { created: true };
  } catch (err) {
    session.endSession();
    const txNotSupported =
      (err &&
        err.message &&
        (/transactions not supported/i.test(err.message) ||
          /Transaction numbers are only allowed/i.test(err.message))) ||
      (err &&
        (err.code === 251 ||
          err.code === 20 ||
          err.codeName === "IllegalOperation"));
    if (txNotSupported) {
      try {
        try {
          await Delivery.create({ ruleId, recipientUserId });
        } catch (de) {
          if (de && de.code === 11000) {
            await incrementDuplicatesBlocked();
            return { created: false, duplicate: true };
          }
          throw de;
        }

        try {
          await DMJob.create({
            ruleId,
            eventId,
            commentId,
            recipientUserId,
            idempotencyKey,
            message,
            status: "queued",
            attempts: 0,
            nextAttemptAt: new Date(),
          });
        } catch (eCreate) {
          if (eCreate && eCreate.code === 11000) {
            return { created: false, duplicate: true };
          }
          throw eCreate;
        }
        return { created: true };
      } catch (e2) {
        if (e2 && e2.code === 11000) {
          return { created: false, duplicate: true };
        }
        throw e2;
      }
    }

    if (err.code === 11000) {
      await incrementDuplicatesBlocked();
      return { created: false, duplicate: true };
    }

    throw err;
  }
}

async function processWebhookEventById(eventId) {
  const ev = await WebhookEvent.findOne({ eventId });
  if (!ev) return;
  if (ev.processed) return;
  if (ev.deleted) return;

  const payload = ev.payload || {};
  const eventType = payload.event_type || payload.eventType;
  if (eventType === "comment.deleted") {
    await WebhookEvent.updateOne(
      { eventId },
      { $set: { deleted: true, processed: true, processedAt: new Date() } },
    );
    return;
  }
  if (eventType !== "comment.created") {
    await WebhookEvent.updateOne(
      { eventId },
      { $set: { processed: true, processedAt: new Date() } },
    );
    return;
  }

  const data = payload.data || {};
  const text = String(data.text || "");
  const commentId = data.comment_id || data.commentId;
  const user = data.from || {};
  const recipientUserId = user.user_id || user.userId;
  if (!recipientUserId) {
    await WebhookEvent.updateOne(
      { eventId },
      { $set: { processed: true, processedAt: new Date() } },
    );
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

      const res = await createDeliveryAndJobAtomic({
        ruleId: rule._id,
        recipientUserId,
        eventId,
        commentId,
        message: rule.dmMessage,
      });

      console.log("JOB RESULT:", res);
    }
  }

  await WebhookEvent.updateOne(
    { eventId },
    { $set: { processed: true, processedAt: new Date() } },
  );
}

async function processPendingWebhookEvents() {
  const pending = await WebhookEvent.find({ processed: false })
    .lean()
    .limit(100);
  for (const ev of pending) {
    try {
      await processWebhookEventById(ev.eventId);
    } catch (err) {
      console.error(
        "processPendingWebhookEvents error",
        err && err.message ? err.message : err,
      );
    }
  }
}

module.exports = {
  createDeliveryAndJobAtomic,
  processWebhookEventById,
  processPendingWebhookEvents,
};
