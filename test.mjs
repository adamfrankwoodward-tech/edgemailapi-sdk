import assert from "node:assert/strict";
import { EdgeMail } from "./index.js";

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return new Response(JSON.stringify({ ok: true, success: true, id: "c_1", verification: { status: "passed" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

try {
  const em = new EdgeMail("em_sdk_contract_test");
  await em.coldReadiness();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/readiness");
  await em.coldReadiness({ campaignId: "camp/readiness" });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/readiness?campaign_id=camp%2Freadiness");
  await em.coldAcceptanceOptions();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/acceptance/options");
  await assert.rejects(
    () => em.coldRunAcceptancePreflight(),
    /accountId, campaignId, and leadId are required/,
  );
  const acceptanceStart = calls.length;
  const acceptance = await em.coldRunAcceptancePreflight({
    accountId: "acct/acceptance",
    campaignId: "camp/acceptance",
    leadId: "lead/acceptance",
    idempotencyKey: "acceptance-contract-1",
  });
  assert.equal(acceptance.no_send, true);
  assert.equal(acceptance.mailbox_in_pool, true);
  assert.match(acceptance.note, /No email was sent/);
  const acceptanceCalls = calls.slice(acceptanceStart);
  assert.deepEqual(acceptanceCalls.map((call) => `${call.options.method} ${call.url}`), [
    "POST https://api.edgemailapi.com/api/accounts/acct%2Facceptance/verify",
    "GET https://api.edgemailapi.com/api/cold/campaigns/camp%2Facceptance",
    "POST https://api.edgemailapi.com/api/cold/campaigns/camp%2Facceptance/preview",
    "POST https://api.edgemailapi.com/api/cold/campaigns/camp%2Facceptance/launch",
    "GET https://api.edgemailapi.com/api/cold/readiness?campaign_id=camp%2Facceptance",
  ]);
  assert.deepEqual(JSON.parse(acceptanceCalls[0].options.body), { idempotency_key: "acceptance-contract-1" });
  assert.equal(acceptanceCalls[0].options.headers["Idempotency-Key"], "acceptance-contract-1");
  assert.deepEqual(JSON.parse(acceptanceCalls[2].options.body), { lead_id: "lead/acceptance" });
  assert.deepEqual(JSON.parse(acceptanceCalls[3].options.body), { dry_run: true, confirm: false, lead_ids: ["lead/acceptance"] });

  await em.coldStartMailboxOAuth("google_oauth");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/accounts/oauth/google_oauth/start");
  await em.coldStartMailboxOAuth("google_oauth", { migrationMailboxId: "mrecon_test" });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/accounts/oauth/google_oauth/start?migration_mailbox_id=mrecon_test");

  await em.getWorkspaceSettings();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/settings");
  await em.setWorkspaceSettings({ outbound_paused: true, outbound_pause_reason: "SDK contract test" });
  assert.equal(calls.at(-1).options.method, "POST");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { outbound_paused: true, outbound_pause_reason: "SDK contract test" });
  await em.setOutboundPause(true, "SDK pause helper");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { outbound_paused: true, outbound_pause_reason: "SDK pause helper" });
  await assert.rejects(() => em.setOutboundPause("true"), /outboundPaused must be boolean/);
  await em.workspaceTeam();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/workspace/team");
  await em.workspaceInviteMember({ email: "operator@example.com", role: "operator" });
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { email: "operator@example.com", role: "operator" });
  await em.workspaceRemoveMember("member/1", { confirm: true, idempotencyKey: "member-remove-contract-1" });
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { id: "member/1", confirm: true, idempotency_key: "member-remove-contract-1" });
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "member-remove-contract-1");
  await assert.rejects(() => em.workspaceRemoveMember("member/1"), /confirm=true is required/);
  await em.workspaceAcceptInvite("ewi_contract");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { invite_token: "ewi_contract" });
  await em.listAuditLog({ action: "outbound.pause", limit: 20 });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/audit-log?action=outbound.pause&limit=20");
  await em.listSuppressions();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/suppressions");
  await em.addSuppression({ email: "blocked@example.com", reason: "contract" }, { idempotencyKey: "suppression-contract-1" });
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "suppression-contract-1");
  await assert.rejects(
    () => em.removeSuppression("blocked@example.com"),
    /confirm_fresh_consent=true is required to remove a suppression/,
  );
  await em.removeSuppression("blocked@example.com", { confirmFreshConsent: true });
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { email: "blocked@example.com", confirm_fresh_consent: true });
  await em.listDomains();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/domains");
  await em.addDomain("mail.example.com", { idempotencyKey: "domain-add-contract-1" });
  assert.equal(calls.at(-1).options.method, "POST");
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "domain-add-contract-1");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { domain: "mail.example.com", idempotency_key: "domain-add-contract-1" });
  await em.domainStatus("mail.example.com");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/domains/mail.example.com/status");
  await assert.rejects(() => em.deleteDomain("mail.example.com"), /confirm=true is required to remove a sending domain/);
  await assert.rejects(() => em.deleteDomain(), /domain required/);
  await em.deleteDomain("mail.example.com", { confirm: true, idempotencyKey: "domain-delete-contract-1" });
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "domain-delete-contract-1");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { domain: "mail.example.com", confirm: true, idempotency_key: "domain-delete-contract-1" });

  await em.listSchedules();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/schedule");
  await em.schedule({ to: "future@example.com", subject: "Later", text: "hello", send_at: "2030-01-01T00:00:00Z" }, { idempotencyKey: "schedule-contract-1" });
  assert.equal(calls.at(-1).options.method, "POST");
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "schedule-contract-1");
  assert.equal(JSON.parse(calls.at(-1).options.body).idempotency_key, "schedule-contract-1");
  await assert.rejects(() => em.cancelSchedule(), /schedule id required/);
  await assert.rejects(() => em.cancelSchedule("sch/1"), /confirm=true is required/);
  await em.cancelSchedule("sch/1", { confirm: true, idempotencyKey: "schedule-cancel-contract-1" });
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "schedule-cancel-contract-1");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { id: "sch/1", confirm: true, idempotency_key: "schedule-cancel-contract-1" });

  await em.listEmailHooks();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/hooks");
  await em.createHook({ to: "notify@example.com", label: "ops" });
  assert.equal(calls.at(-1).options.method, "POST");
  await assert.rejects(() => em.deleteEmailHook(), /email hook token required/);
  await em.deleteEmailHook("hook-token");
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { token: "hook-token" });
  await em.listWebhooks();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/webhooks");
  await em.createWebhook({ url: "https://example.com/edge", events: ["email.sent"] });
  await assert.rejects(() => em.deleteWebhook(), /webhook id required/);
  await em.deleteWebhook("wh/1");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { id: "wh/1" });
  await em.testWebhook("wh/1");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/webhooks/test");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { id: "wh/1" });

  await em.listInboundRules("customer.example");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/inbound/rules?domain=customer.example");
  await em.createInboundRule({ domain: "customer.example", prefix: "reply", forward_to: "ops@example.com" }, { idempotencyKey: "inbound-create-1" });
  const inboundCreate = calls.at(-1);
  assert.equal(inboundCreate.options.headers["Idempotency-Key"], "inbound-create-1");
  assert.deepEqual(JSON.parse(inboundCreate.options.body), { domain: "customer.example", prefix: "reply", forward_to: "ops@example.com", idempotency_key: "inbound-create-1" });
  await assert.rejects(() => em.deleteInboundRule("rule/1"), /confirm=true is required to delete an inbound rule/);
  await assert.rejects(() => em.deleteInboundRule(), /inbound rule id required/);
  await em.deleteInboundRule("rule/1", { confirm: true, idempotencyKey: "inbound-delete-1" });
  const inboundDelete = calls.at(-1);
  assert.equal(inboundDelete.options.method, "DELETE");
  assert.equal(inboundDelete.options.headers["Idempotency-Key"], "inbound-delete-1");
  assert.deepEqual(JSON.parse(inboundDelete.options.body), { confirm: true, idempotency_key: "inbound-delete-1" });
  await em.listInboundLogs();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/inbound/logs");

  await em.coldListMailboxMarketplace();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/mailbox-marketplace");
  await em.coldRequestMailboxProvisioning({ provider: "partner_smtp", domain: "customer.example", mailbox_count: 2, domain_owner_attested: true, acceptable_use_attested: true }, { idempotencyKey: "marketplace-request-1" });
  const marketplaceRequest = calls.at(-1);
  assert.equal(marketplaceRequest.options.headers["Idempotency-Key"], "marketplace-request-1");
  assert.deepEqual(JSON.parse(marketplaceRequest.options.body), { provider: "partner_smtp", domain: "customer.example", mailbox_count: 2, domain_owner_attested: true, acceptable_use_attested: true, idempotency_key: "marketplace-request-1" });
  await em.coldAdminListMailboxRequests({ status: "pending_review" });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/mailbox-marketplace/admin?status=pending_review");
  await em.coldAdminUpdateMailboxRequest("mreq/1", { status: "approved" }, { idempotencyKey: "marketplace-review-1" });
  assert.equal(calls.at(-1).options.method, "PATCH");
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "marketplace-review-1");
  await assert.rejects(
    () => em.coldAdminDeleteMailboxRequest("mreq/1"),
    /confirm=true is required to erase a mailbox provisioning request/,
  );
  await em.coldAdminDeleteMailboxRequest("mreq/1", { confirm: true });
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { confirm: true });

  await em.coldMigrationImport({ dry_run: true, leads: [] }, { idempotencyKey: "migration-preview-1" });
  const migration = calls.at(-1);
  assert.equal(migration.options.headers["Idempotency-Key"], "migration-preview-1");
  assert.deepEqual(JSON.parse(migration.options.body), { dry_run: true, leads: [], idempotency_key: "migration-preview-1" });
  await em.coldMigrationReadiness();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/migration/readiness");
  assert.equal(calls.at(-1).options.method, "GET");
  await em.coldMigrationProof();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/migration/proof");
  assert.equal(calls.at(-1).options.method, "GET");
  await assert.rejects(
    () => em.coldRecordMigrationProof({ gate_id: "team_signoff", evidence: { note: "contract" } }),
    /confirm=true is required to record migration proof/,
  );
  await em.coldRecordMigrationProof({ gate_id: "team_signoff", evidence: { note: "contract" }, confirm: true });
  assert.equal(calls.at(-1).options.method, "POST");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { gate_id: "team_signoff", evidence: { note: "contract" }, confirm: true });

  await assert.rejects(
    () => em.coldRemoveMailbox("acct/remove", { idempotencyKey: "mailbox-delete-1" }),
    /confirm=true is required to remove a mailbox/,
  );
  await em.coldRemoveMailbox("acct/remove", { idempotencyKey: "mailbox-delete-1", confirm: true });
  const removal = calls.at(-1);
  assert.equal(removal.options.method, "DELETE");
  assert.equal(removal.options.headers["Idempotency-Key"], "mailbox-delete-1");
  assert.deepEqual(JSON.parse(removal.options.body), { id: "acct/remove", confirm: true, idempotency_key: "mailbox-delete-1" });
  await assert.rejects(() => em.coldUpdateMailboxCap(), /mailbox id required/);
  await em.coldUpdateMailboxCap("acct/cap", { dailyCap: 80, label: "Sales", enabled: false }, { idempotencyKey: "cap-1" });
  const cap = calls.at(-1);
  assert.equal(cap.options.method, "PATCH");
  assert.equal(cap.options.headers["Idempotency-Key"], "cap-1");
  assert.deepEqual(JSON.parse(cap.options.body), { id: "acct/cap", daily_cap: 80, label: "Sales", enabled: false, idempotency_key: "cap-1" });

  await em.coldListCampaigns({ status: "draft", limit: 25 });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/campaigns?status=draft&limit=25");

  await em.coldDiagnoseCampaign("camp/diagnose");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/campaigns/camp%2Fdiagnose/diagnose");
  assert.equal(calls.at(-1).options.method, "GET");
  await em.coldCampaignStatus("camp/status");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/campaigns/camp%2Fstatus");

  await em.coldCampaignPulse({ days: 7 });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/pulse?days=7");
  await em.coldCampaignPulse();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/pulse");

  await em.coldVerifyLeads(["good@example.com"]);
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/leads/verify");
  assert.equal(calls.at(-1).options.method, "POST");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { emails: ["good@example.com"] });
  await assert.rejects(() => em.coldVerifyLeads(), /emails array required/);
  await assert.rejects(() => em.coldVerifyLeads(new Array(101).fill("a@example.com")), /maximum 100/);
  await em.coldRotateProviderEventToken("acct/1", { confirm: true });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/accounts/acct%2F1/provider-event-token");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { confirm: true });
  await em.coldIngestProviderEvent("acct/1", { type: "delivered", event_id: "evt_1", receipt_id: "rcpt_1" }, { confirm: true });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/provider-events/ingest");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { account_id: "acct/1", event: { type: "delivered", event_id: "evt_1", receipt_id: "rcpt_1" }, confirm: true });
  await assert.rejects(() => em.coldRotateProviderEventToken("acct/1"), /confirm=true/);
  await assert.rejects(() => em.coldIngestProviderEvent("acct/1", { type: "delivered" }), /confirm=true/);

  await assert.rejects(
    () => em.coldLaunchCampaign("camp/guarded", { lead_ids: ["lead_1"] }),
    /confirm=true is required to launch a cold campaign/,
  );
  await em.coldLaunchCampaign("camp/guarded", { dry_run: true, confirm: false });
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { dry_run: true, confirm: false });
  await em.coldLaunchCampaign("camp/guarded", { lead_ids: ["lead_1"] }, { confirm: true, idempotencyKey: "launch-1" });
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { lead_ids: ["lead_1"], confirm: true, idempotency_key: "launch-1" });

  await em.coldCreateCampaign({ name: "test" }, { idempotencyKey: "create-1" });
  const create = calls.at(-1);
  assert.equal(create.options.headers.Authorization, "Bearer em_sdk_contract_test");
  assert.equal(create.options.headers["Idempotency-Key"], "create-1");
  assert.deepEqual(JSON.parse(create.options.body), { name: "test", idempotency_key: "create-1" });

  await em.coldPauseCampaign("camp/1", { idempotencyKey: "pause-1" });
  const pause = calls.at(-1);
  assert.equal(pause.url, "https://api.edgemailapi.com/api/cold/campaigns/camp%2F1");
  assert.equal(pause.options.method, "PATCH");
  assert.deepEqual(JSON.parse(pause.options.body), { status: "paused", idempotency_key: "pause-1" });

  await assert.rejects(
    () => em.coldSendReply("reply/1", { text: "Thanks" }),
    /confirm=true is required to queue a reply/,
  );
  await em.coldSendReply("reply/1", { text: "Thanks" }, { idempotencyKey: "reply-1", confirm: true });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/inbox/reply%2F1/reply");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { text: "Thanks", confirm: true, idempotency_key: "reply-1" });

  await em.coldListReplies({ next_action: "due", limit: 10 });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/inbox?next_action=due&limit=10");

  await em.coldTick({ confirm: true });
  assert.equal(calls.at(-1).options.method, "POST");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/tick");
  await assert.rejects(() => em.coldStopLead(), /enrollment id required/);
  await em.coldStopLead("enroll/1", { idempotencyKey: "stop-one-1" });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/enrollments/enroll%2F1/stop");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { idempotency_key: "stop-one-1" });
  await em.coldStopLeadsBulk({ enrollment_ids: ["enroll/1", "enroll/2"] }, { idempotencyKey: "stop-bulk-1" });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/enrollments/stop-bulk");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { enrollment_ids: ["enroll/1", "enroll/2"], idempotency_key: "stop-bulk-1" });

  await em.coldSimulateReply({ email: "reply@example.com", body: "unsubscribe" }, { confirm: true });
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/cold/replies/simulate");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { email: "reply@example.com", body: "unsubscribe", confirm: true });

  const bulkVerification = await em.coldVerifyMailboxesBulk(["acct/1", "acct/2"], { idempotencyKey: "verify-bulk-1" });
  assert.equal(bulkVerification.success, true);
  assert.equal(calls.at(-2).url, "https://api.edgemailapi.com/api/accounts/acct%2F1/verify");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/accounts/acct%2F2/verify");
  assert.equal(calls.at(-1).options.headers["Idempotency-Key"], "verify-bulk-1:acct/2");

  const repaired = await em.coldRepairMailbox("acct/repair", { host: "smtp.example", username: "user", password: "fixture" }, { idempotencyKey: "repair-1" });
  assert.equal(repaired.success, true);
  assert.equal(calls.at(-2).options.method, "PATCH");
  assert.equal(calls.at(-2).options.headers["Idempotency-Key"], "repair-1");
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/accounts/acct%2Frepair/verify");

  await em.listAgentKeys();
  assert.equal(calls.at(-1).url, "https://api.edgemailapi.com/api/agent-keys");
  await em.updateAgentKey({ id: "a1b2c3d4", revoked: true });
  assert.equal(calls.at(-1).options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { id: "a1b2c3d4", revoked: true });

  console.log(`SDK contract: ${calls.length} requests passed`);
} finally {
  globalThis.fetch = originalFetch;
}
