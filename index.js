/**
 * EdgeMailAPI SDK — minimal, dependency-free. Works in Node, Workers, browsers.
 *
 *   import { EdgeMail } from "edgemailapi";
 *   const em = new EdgeMail("em_yourkey");
 *   await em.send({ to: "a@b.com", subject: "Hi", text: "Hello" });
 *   await em.intent({ goal: "thank Jane for signing up", to: "jane@b.com" });
 */
const DEFAULT_BASE = "https://api.edgemailapi.com";

export class EdgeMail {
  constructor(apiKey, opts = {}) {
    if (!apiKey) throw new Error("EdgeMail: api key required");
    this.apiKey = apiKey;
    this.base = opts.baseUrl || DEFAULT_BASE;
  }

  async _req(method, path, { body, headers } = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e; }
    return data;
  }

  // Send a pre-written email. Pass idempotencyKey to make retries safe.
  send({ idempotencyKey, ...body }) {
    return this._req("POST", "/api/send", { body, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {} });
  }

  // Agent-native: describe the email, we write + send it.
  intent({ idempotencyKey, ...body }) {
    return this._req("POST", "/api/intent", { body, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {} });
  }

  compose(body) { return this._req("POST", "/api/compose", { body }); }
  score(body) { return this._req("POST", "/api/score", { body }); }
  optimize(body) { return this._req("POST", "/api/optimize", { body }); }
  explainBounce(body) { return this._req("POST", "/api/explain-bounce", { body }); }
  receipt(id) { return this._req("GET", `/api/receipt/${id}`); }
  me() { return this._req("GET", "/api/me"); }
  deliverability(domain) { return this._req("GET", `/api/deliverability?domain=${encodeURIComponent(domain)}`); }
  subscribe(email, domain) { return this._req("POST", "/api/subscribe", { body: { email, domain } }); }
  broadcast(body) { return this._req("POST", "/api/broadcast", { body }); }
  schedule(body) { return this._req("POST", "/api/schedule", { body }); }
  createHook(body) { return this._req("POST", "/api/hooks", { body }); }
  createAgentKey(body) { return this._req("POST", "/api/agent-keys", { body }); }
  memory(contact, data) {
    return data ? this._req("POST", "/api/memory", { body: { contact, data } })
                : this._req("GET", `/api/memory?contact=${encodeURIComponent(contact)}`);
  }
}

export default EdgeMail;
