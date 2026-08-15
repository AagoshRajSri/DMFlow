const mongoose = require("mongoose");

const WebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String },
  payload: { type: Object, required: true },
  processed: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  receivedAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
});

module.exports = mongoose.model("WebhookEvent", WebhookEventSchema);
