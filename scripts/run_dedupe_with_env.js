const fs = require("fs");

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

loadEnv("backend/.env");

// require the migration script which immediately runs main()
require("./dedupe_dmjobs.js");
