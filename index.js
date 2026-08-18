/**
 * EdgeMailAPI SDK — minimal, dependency-free. Works in Node, Workers, browsers.
 *
 *   import { EdgeMail } from "@adamfrankwoodward-tech/edgemailapi";
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

  /**
   * Send a tenant-scoped retry key in both the header and body. The API accepts
   * either form, and sending both keeps SDK retries interoperable with REST
   * clients and MCP tool callers without leaking the key into a URL.
   */
  _retry(method, path, body = {}, idempotencyKey) {
    const headers = idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : undefined;
    const payload = idempotencyKey && body && typeof body === "object" && !Array.isArray(body)
      ? { ...body, ...(body.idempotency_key ? {} : { idempotency_key: String(idempotencyKey) }) }
      : body;
    return this._req(method, path, { body: payload, headers });
  }

  _query(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
    }
    const suffix = qs.toString() ? `?${qs}` : "";
    return this._req("GET", `${path}${suffix}`);
  }

  // Send a pre-written email. Pass idempotencyKey to make retries safe.
  // Optional attachments: [{ filename, content (base64), type }]
  send({ idempotencyKey, ...body }) {
    return this._req("POST", "/api/send", { body, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {} });
  }

  // Batch send up to 50 emails. Body: { emails: [{to,subject,html|text}], from_domain?, dry_run? }
  batch(body) {
    return this._req("POST", "/api/batch", { body });
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
  getWorkspaceSettings() { return this._req("GET", "/api/settings"); }
  setWorkspaceSettings(body) { return this._req("POST", "/api/settings", { body }); }
  setOutboundPause(outboundPaused, reason = "") {
    if (typeof outboundPaused !== "boolean") return Promise.reject(new Error("EdgeMail: outboundPaused must be boolean"));
    return this._req("POST", "/api/settings", {
      body: { outbound_paused: outboundPaused, outbound_pause_reason: String(reason || "") },
    });
  }
  workspaceTeam() { return this._req("GET", "/api/workspace/team"); }
  workspaceInviteMember(body) { return this._req("POST", "/api/workspace/team", { body }); }
  workspaceRemoveMember(id, { confirm = false, idempotencyKey } = {}) {
    if (!id) return Promise.reject(new Error("EdgeMail: workspace member id required"));
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to remove a workspace member"));
    return this._retry("DELETE", "/api/workspace/team", { id, confirm: true }, idempotencyKey);
  }
  workspaceAcceptInvite(inviteToken) {
    return this._req("POST", "/api/workspace/team/accept", { body: { invite_token: inviteToken } });
  }
  listAuditLog(params = {}) { return this._query("/api/audit-log", params); }
  listSuppressions() { return this._req("GET", "/api/suppressions"); }
  addSuppression(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/suppressions", body, idempotencyKey); }
  removeSuppression(email, { confirmFreshConsent = false } = {}) {
    if (confirmFreshConsent !== true) return Promise.reject(new Error("EdgeMail: confirm_fresh_consent=true is required to remove a suppression"));
    return this._req("DELETE", "/api/suppressions", { body: { email, confirm_fresh_consent: true } });
  }
  listDomains() { return this._req("GET", "/api/domains"); }
  addDomain(domain, { idempotencyKey } = {}) {
    if (!domain) return Promise.reject(new Error("EdgeMail: domain required"));
    return this._retry("POST", "/api/domains", { domain }, idempotencyKey);
  }
  domainStatus(domain) {
    if (!domain) return Promise.reject(new Error("EdgeMail: domain required"));
    return this._req("GET", `/api/domains/${encodeURIComponent(domain)}/status`);
  }
  deleteDomain(domain, { confirm = false, idempotencyKey } = {}) {
    if (!domain) return Promise.reject(new Error("EdgeMail: domain required"));
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to remove a sending domain"));
    return this._retry("DELETE", "/api/domains", { domain, confirm: true }, idempotencyKey);
  }
  deliverability(domain) { return this._req("GET", `/api/deliverability?domain=${encodeURIComponent(domain)}`); }
  subscribe(email, domain, { resubscribe = false, idempotencyKey } = {}) {
    return this._req("POST", "/api/subscribe", {
      body: { email, domain, ...(resubscribe ? { resubscribe: true } : {}) },
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    });
  }
  broadcast(body) { return this._req("POST", "/api/broadcast", { body }); }
  schedule(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/schedule", body, idempotencyKey); }
  listSchedules() { return this._req("GET", "/api/schedule"); }
  cancelSchedule(id, { confirm = false, idempotencyKey } = {}) {
    if (!id) return Promise.reject(new Error("EdgeMail: schedule id required"));
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to cancel a scheduled email"));
    return this._retry("DELETE", "/api/schedule", { id, confirm: true }, idempotencyKey);
  }
  coldMigrationExport(params = {}) { return this._query("/api/cold/migration/export", params); }
  coldMigrationImport(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/cold/migration/import", body, idempotencyKey); }
  coldMigrationMailboxes({ status, limit } = {}) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (limit) qs.set("limit", String(limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this._req("GET", `/api/cold/migration/mailboxes${suffix}`);
  }

  // ── Cold outreach control plane ────────────────────────────────
  // These methods mirror the REST/MCP cold contract. All mutation methods
  // accept an optional stable retry key; they never send until the server's
  // mailbox, IMAP, compliance, and launch gates pass.
  coldReadiness({ campaignId } = {}) {
    const suffix = campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : "";
    return this._req("GET", `/api/cold/readiness${suffix}`);
  }
  coldAcceptanceOptions() { return this._req("GET", "/api/cold/acceptance/options"); }
  coldMigrationReadiness() { return this._req("GET", "/api/cold/migration/readiness"); }
  coldMigrationProof() { return this._req("GET", "/api/cold/migration/proof"); }
  coldRecordMigrationProof(body = {}) {
    if (body?.confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to record migration proof"));
    return this._req("POST", "/api/cold/migration/proof", { body });
  }
  coldPoolHealth() { return this._req("GET", "/api/cold/pool/health"); }
  coldDeliverabilityReport() { return this._req("GET", "/api/cold/deliverability/report"); }

  coldListLeads(params = {}) { return this._query("/api/cold/leads", params); }
  coldVerifyLeads(emails) {
    if (!Array.isArray(emails) || !emails.length) return Promise.reject(new Error("EdgeMail: emails array required"));
    if (emails.length > 100) return Promise.reject(new Error("EdgeMail: maximum 100 email addresses per verification batch"));
    return this._req("POST", "/api/cold/leads/verify", { body: { emails } });
  }
  coldImportLeads(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/cold/leads/import", body, idempotencyKey); }
  coldUpdateLead(id, body, { idempotencyKey } = {}) { return this._retry("PATCH", `/api/cold/leads/${encodeURIComponent(id)}`, body, idempotencyKey); }
  coldUpdateLeadsBulk(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/cold/leads/bulk", body, idempotencyKey); }
  coldDeleteLead(id, { idempotencyKey } = {}) { return this._retry("DELETE", `/api/cold/leads/${encodeURIComponent(id)}`, {}, idempotencyKey); }
  coldDeleteLeadsBulk(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/cold/leads/delete-bulk", body, idempotencyKey); }
  coldListLeadNotes(id) { return this._req("GET", `/api/cold/leads/${encodeURIComponent(id)}/notes`); }
  coldAddLeadNote(id, body, { idempotencyKey } = {}) { return this._retry("POST", `/api/cold/leads/${encodeURIComponent(id)}/notes`, body, idempotencyKey); }

  coldListMailboxes() { return this._req("GET", "/api/accounts"); }
  coldListMailboxMarketplace() { return this._req("GET", "/api/mailbox-marketplace"); }
  coldRequestMailboxProvisioning(body, { idempotencyKey } = {}) {
    return this._retry("POST", "/api/mailbox-marketplace", body, idempotencyKey);
  }
  coldAdminListMailboxRequests(params = {}) { return this._query("/api/mailbox-marketplace/admin", params); }
  coldAdminUpdateMailboxRequest(id, body, { idempotencyKey } = {}) {
    return this._retry("PATCH", `/api/mailbox-marketplace/admin/${encodeURIComponent(id)}`, body, idempotencyKey);
  }
  coldAdminDeleteMailboxRequest(id, { confirm = false } = {}) {
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to erase a mailbox provisioning request"));
    return this._req("DELETE", `/api/mailbox-marketplace/admin/${encodeURIComponent(id)}`, { body: { confirm: true } });
  }
  coldStartMailboxOAuth(provider, { migrationMailboxId } = {}) {
    if (!["google_oauth", "microsoft_oauth"].includes(provider)) {
      return Promise.reject(new Error("EdgeMail: provider must be google_oauth or microsoft_oauth"));
    }
    const query = migrationMailboxId ? `?migration_mailbox_id=${encodeURIComponent(migrationMailboxId)}` : "";
    return this._req("GET", `/api/accounts/oauth/${encodeURIComponent(provider)}/start${query}`);
  }
  coldConnectMailbox(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/accounts", body, idempotencyKey); }
  coldConnectMailboxesBulk(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/accounts/bulk", body, idempotencyKey); }
  coldUpdateMailbox(body, { idempotencyKey } = {}) { return this._retry("PATCH", "/api/accounts", body, idempotencyKey); }
  coldUpdateMailboxCap(id, { dailyCap, label, enabled } = {}, { idempotencyKey } = {}) {
    if (!id) return Promise.reject(new Error("EdgeMail: mailbox id required"));
    const body = { id };
    if (dailyCap !== undefined) body.daily_cap = dailyCap;
    if (label !== undefined) body.label = label;
    if (enabled !== undefined) body.enabled = enabled;
    return this._retry("PATCH", "/api/accounts", body, idempotencyKey);
  }
  coldRemoveMailbox(id, { idempotencyKey, confirm = false } = {}) {
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to remove a mailbox"));
    return this._retry("DELETE", "/api/accounts", { id, confirm: true }, idempotencyKey);
  }
  coldVerifyMailbox(id, { idempotencyKey } = {}) { return this._retry("POST", `/api/accounts/${encodeURIComponent(id)}/verify`, {}, idempotencyKey); }
  coldRotateProviderEventToken(id, { confirm = false } = {}) {
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to rotate a provider event token"));
    return this._req("POST", `/api/accounts/${encodeURIComponent(id)}/provider-event-token`, { body: { confirm: true } });
  }
  coldIngestProviderEvent(accountId, event, { confirm = false } = {}) {
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to ingest a provider event"));
    if (!accountId || !event || typeof event !== "object" || Array.isArray(event)) return Promise.reject(new Error("EdgeMail: account id and provider event object required"));
    return this._req("POST", "/api/cold/provider-events/ingest", { body: { account_id: accountId, event, confirm: true } });
  }
  coldVerifyMailboxesBulk(ids, { idempotencyKey } = {}) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean))].slice(0, 100);
    if (!unique.length) return Promise.reject(new Error("EdgeMail: ids must contain at least one mailbox id"));
    const results = [];
    return unique.reduce(
      (chain, id) => chain.then(async () => {
        const childKey = idempotencyKey ? `${idempotencyKey}:${id}` : undefined;
        try {
          const result = await this.coldVerifyMailbox(id, { idempotencyKey: childKey });
          results.push({ id, ok: result.success === true, status: 200, message_sent: result.message_sent === true, ...result });
        } catch (error) {
          results.push({ id, ok: false, status: error.status || 0, message_sent: false, error: error.message || "Mailbox verification failed" });
        }
      }),
      Promise.resolve(),
    ).then(() => ({ success: results.every((result) => result.ok === true), total: results.length, passed: results.filter((result) => result.ok === true).length, failed: results.filter((result) => result.ok !== true).length, message_sent: false, results, note: "Mailbox verification ran sequentially. No test messages were sent." }));
  }
  coldRepairMailbox(id, credentials, { idempotencyKey } = {}) {
    if (!id || !credentials || typeof credentials !== "object" || Array.isArray(credentials) || Object.keys(credentials).length === 0) {
      return Promise.reject(new Error("EdgeMail: credentials must contain a fresh provider-issued secret"));
    }
    return this._retry("PATCH", "/api/accounts", { id, credentials }, idempotencyKey).then(async (patched) => {
      const verification = await this.coldVerifyMailbox(id, { idempotencyKey });
      return {
        success: patched.success !== false && verification.success === true,
        id,
        credentials_replaced: patched.success !== false,
        verification: verification.verification,
        verification_http_status: 200,
        verification_success: verification.success === true,
        message_sent: false,
        error: verification.error || verification.smtp?.error || verification.imap?.error,
        note: "Credentials were replaced and the mailbox was re-verified without sending a message.",
      };
    });
  }
  coldConnectImap(id, body, { idempotencyKey } = {}) { return this._retry("POST", `/api/cold/mailboxes/${encodeURIComponent(id)}/imap`, body, idempotencyKey); }

  coldCreateCampaign(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/cold/campaigns", body, idempotencyKey); }
  coldListCampaigns(params = {}) { return this._query("/api/cold/campaigns", params); }
  coldGetCampaign(id) { return this._req("GET", `/api/cold/campaigns/${encodeURIComponent(id)}`); }
  coldUpdateCampaign(id, body, { idempotencyKey } = {}) { return this._retry("PATCH", `/api/cold/campaigns/${encodeURIComponent(id)}`, body, idempotencyKey); }
  coldSetSequence(id, steps, { idempotencyKey } = {}) { return this._retry("POST", `/api/cold/campaigns/${encodeURIComponent(id)}/sequence`, { steps }, idempotencyKey); }
  coldCloneCampaign(id, body = {}, { idempotencyKey } = {}) { return this._retry("POST", `/api/cold/campaigns/${encodeURIComponent(id)}/clone`, body, idempotencyKey); }
  coldPreviewCampaign(id, body = {}) { return this._req("POST", `/api/cold/campaigns/${encodeURIComponent(id)}/preview`, { body }); }
  /**
   * Run the same guided, no-send acceptance path exposed by the dashboard and
   * MCP. Every stage is returned so an operator can see the exact blocker
   * instead of losing the rest of the preflight to one failed request.
   */
  async coldRunAcceptancePreflight({ accountId, campaignId, leadId, idempotencyKey } = {}) {
    const account = String(accountId || "").trim();
    const campaign = String(campaignId || "").trim();
    const lead = String(leadId || "").trim();
    if (!account || !campaign || !lead) {
      throw new Error("EdgeMail: accountId, campaignId, and leadId are required");
    }
    const capture = async (run) => {
      try {
        return { ok: true, data: await run(), status: 200 };
      } catch (error) {
        return {
          ok: false,
          data: {
            ...(error?.data && typeof error.data === "object" ? error.data : {}),
            error: error?.message || "EdgeMail request failed",
          },
          status: Number.isFinite(error?.status) ? error.status : 0,
        };
      }
    };
    const verification = await capture(() => this.coldVerifyMailbox(account, { idempotencyKey }));
    const detail = await capture(() => this.coldGetCampaign(campaign));
    const rawPool = detail.data?.campaign?.mailbox_pool;
    let campaignPool = Array.isArray(rawPool) ? rawPool : null;
    if (!campaignPool && typeof rawPool === "string") {
      try {
        const parsedPool = JSON.parse(rawPool);
        if (Array.isArray(parsedPool)) campaignPool = parsedPool;
      } catch (_) {
        campaignPool = null;
      }
    }
    const mailboxInPool = detail.ok
      ? (!campaignPool || campaignPool.includes("*") || campaignPool.includes(account))
      : null;
    const copyPreview = await capture(() => this.coldPreviewCampaign(campaign, { lead_id: lead }));
    const dryRun = await capture(() => this.coldLaunchCampaign(campaign, {
      dry_run: true,
      confirm: false,
      lead_ids: [lead],
    }));
    const readiness = await capture(() => this.coldReadiness({ campaignId: campaign }));
    return {
      read_only: false,
      no_send: true,
      account_id: account,
      campaign_id: campaign,
      lead_id: lead,
      mailbox_in_pool: mailboxInPool,
      verification: verification.data,
      copy_preview: copyPreview.data,
      dry_run: dryRun.data,
      readiness: readiness.data,
      external_proof: readiness.data?.external_proof || null,
      stage_status: {
        verification: verification.status,
        campaign: detail.status,
        copy_preview: copyPreview.status,
        dry_run: dryRun.status,
        readiness: readiness.status,
      },
      note: "No email was sent and no lead was enrolled. This preflight renders recipient-specific copy, checks the provider handshake and campaign pool, runs a one-lead dry-run, and reads canonical readiness; delivery, reply-stop, inbox placement, and team sign-off remain separate external proof gates.",
    };
  }
  coldLaunchCampaign(id, body = {}, { idempotencyKey, confirm = false } = {}) {
    const payload = { ...body };
    if (payload.dry_run === true) {
      if (payload.confirm == null) payload.confirm = confirm === true;
    } else if (payload.confirm !== true && confirm !== true) {
      return Promise.reject(new Error("EdgeMail: confirm=true is required to launch a cold campaign"));
    } else {
      payload.confirm = true;
    }
    return this._retry("POST", `/api/cold/campaigns/${encodeURIComponent(id)}/launch`, payload, idempotencyKey);
  }
  coldPauseCampaign(id, { idempotencyKey } = {}) { return this._retry("PATCH", `/api/cold/campaigns/${encodeURIComponent(id)}`, { status: "paused" }, idempotencyKey); }
  coldResumeCampaign(id, { idempotencyKey } = {}) { return this._retry("PATCH", `/api/cold/campaigns/${encodeURIComponent(id)}`, { status: "active" }, idempotencyKey); }
  coldArchiveCampaign(id, { idempotencyKey } = {}) { return this._retry("PATCH", `/api/cold/campaigns/${encodeURIComponent(id)}`, { status: "archived" }, idempotencyKey); }
  coldCampaignAnalytics(id, params = {}) { return this._query(`/api/cold/campaigns/${encodeURIComponent(id)}/analytics`, params); }
  coldCampaignPulse(params = {}) { return this._query("/api/cold/pulse", params); }
  coldCampaignStatus(id) { return this.coldGetCampaign(id); }
  coldDiagnoseCampaign(id) { return this._req("GET", `/api/cold/campaigns/${encodeURIComponent(id)}/diagnose`); }
  coldExportCampaignActivity(id, params = {}) { return this._query(`/api/cold/campaigns/${encodeURIComponent(id)}/analytics/export`, params); }
  coldListCampaignActivity(id, params = {}) { return this._query(`/api/cold/campaigns/${encodeURIComponent(id)}/activity`, params); }
  coldListEnrollments(id, params = {}) { return this._query(`/api/cold/campaigns/${encodeURIComponent(id)}/enrollments`, params); }
  coldTick({ confirm = false } = {}) {
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to process due cold enrollments"));
    return this._req("POST", "/api/cold/tick", { body: { confirm: true } });
  }
  coldSimulateReply(body, { confirm = false } = {}) {
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to simulate a reply"));
    return this._req("POST", "/api/cold/replies/simulate", { body: { ...body, confirm: true } });
  }

  coldListInbox(params = {}) { return this._query("/api/cold/inbox", params); }
  coldListReplies(params = {}) { return this.coldListInbox(params); }
  coldGetReplyThread(id) { return this._req("GET", `/api/cold/inbox/${encodeURIComponent(id)}/thread`); }
  coldSendReply(id, body = {}, { idempotencyKey, confirm = false } = {}) {
    const payload = { ...body };
    if (payload.dry_run === true) {
      if (payload.confirm == null) payload.confirm = confirm === true;
    } else if (payload.confirm !== true && confirm !== true) {
      return Promise.reject(new Error("EdgeMail: confirm=true is required to queue a reply"));
    } else {
      payload.confirm = true;
    }
    return this._retry("POST", `/api/cold/inbox/${encodeURIComponent(id)}/reply`, payload, idempotencyKey);
  }
  coldStopEnrollment(id, { idempotencyKey } = {}) { return this._retry("POST", `/api/cold/enrollments/${encodeURIComponent(id)}/stop`, {}, idempotencyKey); }
  coldStopEnrollmentsBulk(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/cold/enrollments/stop-bulk", body, idempotencyKey); }
  coldStopLead(enrollmentId, { idempotencyKey } = {}) {
    if (!enrollmentId) return Promise.reject(new Error("EdgeMail: enrollment id required"));
    return this._retry("POST", `/api/cold/enrollments/${encodeURIComponent(enrollmentId)}/stop`, {}, idempotencyKey);
  }
  coldStopLeadsBulk(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/cold/enrollments/stop-bulk", body, idempotencyKey); }

  // Reusable templates and operational receipts complete the non-MCP SDK
  // parity path for teams migrating from a dashboard-first provider.
  listTemplates() { return this._req("GET", "/api/templates"); }
  getTemplate(id) { return this._req("GET", `/api/templates/${encodeURIComponent(id)}`); }
  createTemplate(body) { return this._req("POST", "/api/templates", { body }); }
  updateTemplate(id, body) { return this._req("PATCH", `/api/templates/${encodeURIComponent(id)}`, { body }); }
  deleteTemplate(id) { return this._req("DELETE", `/api/templates/${encodeURIComponent(id)}`); }
  listReceipts(params = {}) { return this._query("/api/receipts", params); }
  rssDraft(feedUrl) { return this._req("POST", "/api/rss-draft", { body: { feed_url: feedUrl } }); }
  createHook(body) { return this._req("POST", "/api/hooks", { body }); }
  listEmailHooks() { return this._req("GET", "/api/hooks"); }
  deleteEmailHook(token) {
    if (!token) return Promise.reject(new Error("EdgeMail: email hook token required"));
    return this._req("DELETE", "/api/hooks", { body: { token } });
  }
  listWebhooks() { return this._req("GET", "/api/webhooks"); }
  createWebhook(body) { return this._req("POST", "/api/webhooks", { body }); }
  deleteWebhook(id) {
    if (!id) return Promise.reject(new Error("EdgeMail: webhook id required"));
    return this._req("DELETE", "/api/webhooks", { body: { id } });
  }
  testWebhook(id) {
    if (!id) return Promise.reject(new Error("EdgeMail: webhook id required"));
    return this._req("POST", "/api/webhooks/test", { body: { id } });
  }
  // Inbound routing parity: rules are tenant-scoped and create/delete retries
  // use the same stable key contract as REST and MCP. Deletion is explicit so
  // an agent cannot remove a forwarding route on an ambiguous retry.
  listInboundRules(domain) { return this._query("/api/inbound/rules", domain ? { domain } : {}); }
  createInboundRule(body, { idempotencyKey } = {}) { return this._retry("POST", "/api/inbound/rules", body, idempotencyKey); }
  deleteInboundRule(id, { idempotencyKey, confirm = false } = {}) {
    if (!id) return Promise.reject(new Error("EdgeMail: inbound rule id required"));
    if (confirm !== true) return Promise.reject(new Error("EdgeMail: confirm=true is required to delete an inbound rule"));
    return this._retry("DELETE", `/api/inbound/rules/${encodeURIComponent(id)}`, { confirm: true }, idempotencyKey);
  }
  listInboundLogs() { return this._req("GET", "/api/inbound/logs"); }
  listAgentKeys() { return this._req("GET", "/api/agent-keys"); }
  createAgentKey(body) { return this._req("POST", "/api/agent-keys", { body }); }
  updateAgentKey(body) { return this._req("PATCH", "/api/agent-keys", { body }); }
  memory(contact, data) {
    return data ? this._req("POST", "/api/memory", { body: { contact, data } })
                : this._req("GET", `/api/memory?contact=${encodeURIComponent(contact)}`);
  }
}

export default EdgeMail;
