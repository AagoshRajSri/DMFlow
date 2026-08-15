const mongoose = require('mongoose');
const DMJob = require('../backend/src/models/DMJob');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  // 1) count duplicate active groups (ruleId+recipientUserId) where count>1
  const dupGroups = await DMJob.aggregate([
    { $match: { status: { $in: ['queued','processing','accepted'] } } },
    { $group: { _id: { ruleId: '$ruleId', recipientUserId: '$recipientUserId' }, count: { $sum: 1 }, docs: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]).allowDiskUse(true).exec();

  console.log('duplicateActiveGroupsCount=', dupGroups.length);

  // 2) count DMJobs marked failed with lastError duplicate_migrated
  const migratedCount = await DMJob.countDocuments({ lastError: 'duplicate_migrated' });
  console.log('duplicateMigratedRows=', migratedCount);

  // 3) number retained active jobs (unique groups after migration)
  const activeUnique = await DMJob.aggregate([
    { $match: { status: { $in: ['queued','processing','accepted'] } } },
    { $group: { _id: { ruleId: '$ruleId', recipientUserId: '$recipientUserId' }, count: { $sum: 1 } } },
    { $match: { count: { $gte: 1 } } },
    { $count: 'uniqueActive' }
  ]).exec();
  console.log('uniqueActiveGroups=', (activeUnique[0] && activeUnique[0].uniqueActive) || 0);

  // 4) total active DMJobs
  const totalActive = await DMJob.countDocuments({ status: { $in: ['queued','processing','accepted'] } });
  console.log('totalActiveJobs=', totalActive);

  // 5) check duplicate idempotencyKey values among active jobs
  const dupIdemp = await DMJob.aggregate([
    { $match: { status: { $in: ['queued','processing','accepted'] }, idempotencyKey: { $ne: null } } },
    { $group: { _id: '$idempotencyKey', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'dupIdempotencyKeys' }
  ]).exec();
  console.log('duplicateActiveIdempotencyKeys=', (dupIdemp[0] && dupIdemp[0].dupIdempotencyKeys) || 0);

  // 6) check index exists
  const indexes = await DMJob.collection.indexes();
  const hasPartial = indexes.some(ix => ix.key && ix.key.idempotencyKey && ix.partialFilterExpression && ix.partialFilterExpression.status && ix.partialFilterExpression.status.$in);
  console.log('hasPartialIdempotencyIndex=', hasPartial);

  await mongoose.disconnect();
}

// load env from backend/.env
const fs = require('fs');
if (fs.existsSync('backend/.env')) {
  const lines = fs.readFileSync('backend/.env','utf8').split(/\r?\n/);
  for (let line of lines) {
    line = line.trim(); if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq === -1) continue; const key=line.slice(0,eq).trim(); let val=line.slice(eq+1).trim(); if (val.startsWith('"') && val.endsWith('"')) val=val.slice(1,-1); process.env[key]=val;
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
