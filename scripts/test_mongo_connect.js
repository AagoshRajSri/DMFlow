const fs = require('fs');
const mongoose = require('mongoose');

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

loadEnv('backend/.env');
const uri = process.env.MONGODB_URI;
console.log('MONGODB_URI set?', !!uri);

(async () => {
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 5000 });
    console.log('connected');
    await mongoose.disconnect();
  } catch (err) {
    console.error('connect error', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
