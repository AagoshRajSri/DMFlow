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

DMJobSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model("DMJob", DMJobSchema);
