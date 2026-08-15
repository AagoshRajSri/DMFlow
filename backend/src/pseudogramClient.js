const axios = require("axios");

class PseudoGramClient {
  constructor({ baseURL, apiKey, limiter }) {
    this.axios = axios.create({ baseURL, timeout: 10000 });
    this.apiKey = apiKey;
    this.limiter = limiter; // Bottleneck instance
  }

  async sendDM(payload, idempotencyKey) {
    const fn = async () => {
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

    if (this.limiter) return this.limiter.schedule(fn);
    return fn();
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
