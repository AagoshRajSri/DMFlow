// One-time migration: dedupe active DMJobs by composite key ruleId:recipientUserId
// Keeps the earliest created job, marks others as failed with lastError 'duplicate_migrated'
// Usage: node scripts/dedupe_dmjobs.js

const mongoose = require("mongoose");
const DMJob = require("../backend/src/models/DMJob");

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI required");
    process.exit(1);
  }
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("connected");

  // find active statuses
  const active = ["queued", "processing", "accepted"];
  const cursor = DMJob.find({ status: { $in: active } }).cursor();
  const groups = new Map();

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const key = `${doc.ruleId.toString()}:${doc.recipientUserId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }

  let fixed = 0;
  for (const [key, docs] of groups.entries()) {
    if (docs.length <= 1) continue;
    // sort by createdAt ascending, keep first
    docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const keep = docs[0];
    const toFail = docs.slice(1);
    const ids = toFail.map((d) => d._id);
    await DMJob.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: "failed",
          lastError: "duplicate_migrated",
          updatedAt: new Date(),
        },
      },
    );
    fixed += toFail.length;
    console.log(
      `Group ${key} kept ${keep._id.toString()} failed ${toFail.length}`,
    );
  }

  console.log(`migration done, fixed ${fixed} rows`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
