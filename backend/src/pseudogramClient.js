const axios = require("axios");

class PseudoGramClient {
  constructor({ baseURL, apiKey, limiter }) {
    this.axios = axios.create({ baseURL, timeout: 10000 });
    this.apiKey = apiKey;
    this.limiter = limiter; // Bottleneck instance
  }

  async sendDM(payload, idempotencyKey) {
    const fn = async () => {
      // execute the HTTP request; validateStatus allows handling in caller
      const resp = await this.axios.post("/v1/dm/send", payload, {
        headers: {
          "X-API-Key": this.apiKey,
          "Idempotency-Key": idempotencyKey,
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      });
      return resp;
    };

    if (this.limiter) {
      try {
        console.log("DM REQUEST", { idempotencyKey, recipient: payload.recipient_user_id });
        const resp = await this.limiter.schedule(fn);
        console.log("DM RESPONSE", { status: resp.status });
        return resp;
      } catch (err) {
        console.error("DM REQUEST ERROR", { idempotencyKey, recipient: payload.recipient_user_id, err: err && err.message ? err.message : String(err) });
        throw err;
      }
    }
    console.log("DM REQUEST (no limiter)", { idempotencyKey, recipient: payload.recipient_user_id });
    const resp = await fn();
    console.log("DM RESPONSE (no limiter)", { status: resp.status });
    return resp;
  }

  async getDMStatus(dmId) {
    // GET status should NOT count against the DM send rate limit
    const resp = await this.axios.get(`/v1/dm/${encodeURIComponent(dmId)}`, {
      headers: { "X-API-Key": this.apiKey },
      validateStatus: () => true,
    });
    return resp;
  }
}

module.exports = PseudoGramClient;
