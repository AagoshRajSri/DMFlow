const mongoose = require('mongoose');

const DeliverySchema = new mongoose.Schema({
  ruleId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Rule' },
  recipientUserId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending','delivered','failed'], default: 'pending' },
  lastUpdatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

DeliverySchema.index({ ruleId: 1, recipientUserId: 1 }, { unique: true });

module.exports = mongoose.model('Delivery', DeliverySchema);
