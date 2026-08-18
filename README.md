# EdgeMailAPI — agent-native email

Send transactional email, newsletters, and agent-authored email from one tiny API.
Built to be handed to API and MCP agents: deterministic helpers, idempotent retries,
scoped/capped keys, and machine-readable receipts.

```bash
# GitHub Packages (the published package is scoped)
npm config set @adamfrankwoodward-tech:registry https://npm.pkg.github.com
npm install @adamfrankwoodward-tech/edgemailapi
```

GitHub Packages downloads currently require a classic GitHub token with the
`read:packages` scope. Keep it in an environment variable and configure npm
without pasting it into source control:

```powershell
$env:GITHUB_PACKAGES_TOKEN = "ghp_..."
npm config set //npm.pkg.github.com/:_authToken $env:GITHUB_PACKAGES_TOKEN
```

The source release is public; package visibility can be changed separately in
GitHub Package settings when a public, token-free install is desired.

Releases are validated and published to GitHub Packages by the repository
workflow when an `sdk-v*` tag is pushed. The package is intentionally not
published by local test commands.

```js
import { EdgeMail } from "@adamfrankwoodward-tech/edgemailapi";
const em = new EdgeMail(process.env.EDGEMAIL_API_KEY);

// Send something you wrote
await em.send({ to: "a@b.com", subject: "Welcome", text: "Glad you're here." });

// Batch up to 50 emails
await em.batch({
  emails: [
    { to: "a@b.com", subject: "Hi", text: "Hello" },
    { to: "c@d.com", subject: "Hi", html: "<p>Hello</p>" },
  ],
});

// With a base64 attachment
await em.send({
  to: "a@b.com",
  subject: "Report",
  text: "See attached.",
  attachments: [{ filename: "data.csv", type: "text/csv", content: Buffer.from("a,b").toString("base64") }],
});

// Compatibility helper: deterministic draft shell + send
await em.intent({ goal: "thank Jane for upgrading and link the docs", to: "jane@b.com" });
```

## Cold outreach control plane

The same SDK also covers the Instantly-style control plane. These calls are
readable from any API key with the matching access profile; mutations accept an
optional stable `idempotencyKey` so a client timeout can be retried safely.
Cold launch still requires a customer-owned provider mailbox, a successful IMAP
checkpoint, lawful lead provenance, and an explicit launch call — the SDK never
bypasses those server-side gates.

```js
const readiness = await em.coldReadiness();
const { accounts } = await em.coldListMailboxes();
const campaign = await em.coldCreateCampaign(
  { name: "Q4 outbound", physical_address: "1 Main St, Austin, TX" },
  { idempotencyKey: "campaign-create-q4" },
);
const campaignReadiness = await em.coldReadiness({ campaignId: campaign.id });
await em.coldSetSequence(campaign.id, [
  { day: 0, subject: "Quick question", text: "Hello {{first_name}}" },
]);
await em.coldLaunchCampaign(
  campaign.id,
  { dry_run: true, confirm: false },
  { idempotencyKey: "q4-preview" },
);
// After reviewing would_enroll and getting explicit operator approval:
await em.coldLaunchCampaign(
  campaign.id,
  { confirm: true },
  { idempotencyKey: "q4-launch", confirm: true },
);
```

For a first safe operator walkthrough, use the same guided acceptance contract
as the dashboard and MCP. `coldAcceptanceOptions()` returns connected mailboxes,
draft campaigns, and active leads without contacting a provider. Then run the
no-send preflight with one selected ID from each list:

```js
const choices = await em.coldAcceptanceOptions();
const acceptance = await em.coldRunAcceptancePreflight({
  accountId: choices.accounts[0].id,
  campaignId: choices.campaigns[0].id,
  leadId: choices.leads[0].id,
  idempotencyKey: "first-safe-acceptance",
});
// acceptance.copy_preview is recipient-specific; acceptance.dry_run never enrolls or sends.
```

The result includes mailbox verification, campaign-pool membership,
personalized copy, one-lead `dry_run: true`, canonical readiness, and the four
separate external proof gates. It never sends a message or enrolls a lead.

Available groups include `cold*` mailbox, lead, campaign, inbox, reply-stop,
analytics, pool-health, and deliverability methods. Mailbox controls include
staged `coldRepairMailbox` and sequential no-send `coldVerifyMailboxesBulk`; inbox
consumers can use `coldListReplies` with the same queue filters exposed by MCP,
and `coldSendReply(replyId, { text }, { confirm: true })` requires explicit
confirmation before it can queue a real threaded reply. Controlled operator probes can call `coldTick({ confirm: true })`/
`coldSimulateReply(payload, { confirm: true })`; both require explicit confirmation
and do not bypass server-side safety gates. The SDK also includes `listTemplates`,
`createTemplate`, `listReceipts`, and `rssDraft`. `coldStartMailboxOAuth("google_oauth")`
or `coldStartMailboxOAuth("microsoft_oauth")` returns a short-lived provider consent
URL; pass `{ migrationMailboxId }` when reconnecting an imported mailbox so the
callback can link the account only after the provider email matches. Provider client
configuration and callback registration must be complete first.
`coldMigrationImport(payload, { idempotencyKey })` carries the same retry-safe contract
as REST and MCP. The mailbox marketplace workflow is also available through
`coldListMailboxMarketplace`, `coldRequestMailboxProvisioning`,
`coldAdminListMailboxRequests`, `coldAdminUpdateMailboxRequest`, and the
confirmation-gated `coldAdminDeleteMailboxRequest`. Use `coldLaunchCampaign` only after reviewing the dry-run response
and the readiness checklist; a non-dry-run call requires `confirm: true` (or the
`confirm: true` option) and is rejected locally if omitted.

`coldVerifyLeads(["person@example.com"])` performs a no-send syntax and
recipient-domain MX preflight (up to 100 addresses) before import or enrollment;
it never opens SMTP, enumerates a mailbox, or delivers a message.

Provider delivery and inbound-reply callbacks can be wired with
`coldRotateProviderEventToken(id, { confirm: true })`; the raw token is returned
once for the provider webhook. Use `coldIngestProviderEvent(id, event,
{ confirm: true })` for an authenticated middleware replay. These paths
deduplicate provider event IDs, update cold analytics/Unibox, and stop
bounced, complained, or replied follow-ups without sending. Reply events may
include `from`/`sender`, `subject`, `text`/`body`, `message_id`, and
`in_reply_to`, or a multi-message `References` chain (including a provider
`headers` object); the public callback also accepts URL-encoded and multipart
form payloads from providers that do not emit JSON.

Migration cutover evidence is available through `coldMigrationProof()`. Provider
delivery and reply-stop gates close only from authenticated provider callbacks;
the owner/admin can record measured inbox placement or team sign-off with
`coldRecordMigrationProof({ gate_id, evidence, confirm: true })`; the SDK rejects
that write locally when `confirm` is omitted, before making a network request.

Operational cold controls are also available without dropping to raw REST:
`coldUpdateMailboxCap(id, { dailyCap, label, enabled }, { idempotencyKey })`,
`coldCampaignStatus(id)`, `coldStopLead(enrollmentId, { idempotencyKey })`, and
`coldStopLeadsBulk(payload, { idempotencyKey })`. These controls preserve the
same tenant-scoped retry behavior and stop/rollback protections used by MCP.

For a workspace-level campaign snapshot, use the read-only aggregate pulse:

```js
const pulse = await em.coldCampaignPulse({ days: 7 });
// pulse.campaigns, pulse.sent, pulse.delivered, pulse.replied, pulse.bounced
```

Omit `days` for all-time totals or pass an integer from 1 to 90. The response
also includes a UTC `generated_at` timestamp and `metric_sources` labels so a
report can be traced back to its tenant-scoped aggregate query. `delivered`
means the connected provider accepted the message after queue dispatch; it is
not inbox-placement proof. The call never enrolls, queues, or sends.

Team operators can also use `getWorkspaceSettings`, `setWorkspaceSettings`,
`setOutboundPause`, `listAgentKeys`, `createAgentKey`, and `updateAgentKey`,
`workspaceTeam`, `workspaceInviteMember`, `workspaceRemoveMember`,
`workspaceAcceptInvite`, `listAuditLog`, and the suppression helpers
`listSuppressions`, `addSuppression`, and confirmation-gated
`removeSuppression` without dropping to raw REST. Operational controls include
`listSchedules`/`schedule`/`cancelSchedule` (schedule retries accept a stable
`idempotencyKey`; cancellation requires `confirm: true`), email-hook CRUD (`createHook`,
`listEmailHooks`, `deleteEmailHook`), and event-webhook CRUD plus a controlled
`testWebhook` helper (`listWebhooks`, `createWebhook`, `deleteWebhook`).
Inbound routing is also available through `listInboundRules`,
`createInboundRule`, `listInboundLogs`, and confirmation-gated
`deleteInboundRule`; create/delete accept stable `idempotencyKey` values so
timeouts replay the original rule result instead of creating a duplicate or
removing an ambiguous route.
Domain registration and reads are available through `addDomain`, `listDomains`,
and `domainStatus`; `addDomain` accepts a stable `idempotencyKey`, while destructive
`deleteDomain` requires `confirm: true` and accepts a stable `idempotencyKey`.

## CLI
```bash
npx edgemail init --key em_xxx
npx edgemail send --to you@example.com --subject "Hi" --text "Hello"
npx edgemail intent --to you@example.com --goal "remind them to finish setup" --dry
npx edgemail check edgemailapi.com          # deliverability report
npx edgemail migrate --input instantly-export.json             # preview counts; no writes
npx edgemail migrate --input instantly-export.json --apply    # import leads + draft campaigns
npx edgemail migrate --export edgemail-migration.json        # provider-neutral export
npx edgemail migrate --subscribers list.csv --domain you.com # dry-run subscriber preview
npx edgemail migrate --subscribers list.csv --domain you.com --apply # explicit subscriber write
npx edgemail migrate --suppressions suppressions.csv # dry-run suppression preview
npx edgemail migrate --suppressions suppressions.csv --apply # explicit suppression write
```

Migration input accepts the provider-neutral EdgeMail JSON shape plus common
Instantly aliases (`contacts`, `prospects`, `sequences`, `emails`, `Email`,
`firstName`, and `companyName`). JSON and quoted/multiline CSV are supported.
Mailbox credentials and API keys are never imported. Every migration import is
dry-run by default; `--apply` is the explicit write boundary. Subscriber and
suppression lists report valid/invalid rows before applying, and imported
campaigns stay drafts until fresh mailboxes, IMAP, compliance, and launch
readiness pass. Applied list rows use stable idempotency keys, so rerunning after a
network timeout replays each completed row instead of creating duplicate consent or
suppression work.

## GitHub Action
```yaml
- uses: YOUR_GH/edgemailapi-sdk@v1
  with:
    api_key: ${{ secrets.EDGEMAIL_API_KEY }}
    to: team@you.com
    subject: "Deploy ${{ github.sha }} succeeded"
    text: "Production is live."
```

## MCP (for AI agents)
Add to your MCP client (Claude Desktop, Cursor, etc.):
```json
{ "mcpServers": { "edgemail": { "command": "npx",
  "args": ["mcp-remote","https://mcp.edgemailapi.com/","--header","Authorization: Bearer em_YOUR_KEY"] } } }
```

MIT licensed. Docs: https://edgemailapi.com
