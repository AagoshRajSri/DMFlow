const crypto = require('crypto');

function timingSafeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifySignature(rawBody, signatureHeader, apiKey) {
  if (!signatureHeader) return false;
  const match = /^sha256=(.+)$/.exec(signatureHeader);
  if (!match) return false;
  const sig = match[1];
  const h = crypto.createHmac('sha256', apiKey).update(rawBody).digest('hex');
  return timingSafeCompare(h, sig);
}

module.exports = { verifySignature };
