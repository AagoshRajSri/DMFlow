const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
  keyword: { type: String, required: true, index: true },
  dmMessage: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Rule', RuleSchema);
