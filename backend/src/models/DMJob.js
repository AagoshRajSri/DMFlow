const mongoose = require("mongoose");

const DMJobSchema = new mongoose.Schema(
  {
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Rule",
    },
    eventId: { type: String },
    commentId: { type: String },
    recipientUserId: { type: String, required: true },
    idempotencyKey: { type: String, index: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "accepted", "delivered", "failed"],
      default: "queued",
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    dmId: { type: String },
    lastError: { type: String },
  },
  { timestamps: true },
);

// index to support job lookup by status/nextAttempt
DMJobSchema.index({ status: 1, nextAttemptAt: 1 });

// enforce one active job per idempotencyKey (queued/processing/accepted)
// this is a partial unique index so historical/failed/delivered rows are allowed
DMJobSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["queued", "processing", "accepted"] },
    },
  },
);

module.exports = mongoose.model("DMJob", DMJobSchema);
