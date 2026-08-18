#!/usr/bin/env node
/**
 * EdgeMail CLI — `edgemail <command>`
 *   edgemail init                              save your API key
 *   edgemail send --to a@b.com --subject Hi --text "Hello"
 *   edgemail intent --to a@b.com --goal "thank them for signing up"
 *   edgemail check <domain>                    deliverability report
 *   edgemail migrate --input instantly.json             safe migration preview
 *   edgemail migrate --input instantly.json --apply    explicitly import drafts
 *   edgemail migrate --export migration.json           export a provider-neutral snapshot
 *   edgemail migrate --subscribers file.csv --domain x [--apply]
 *   edgemail migrate --suppressions file.csv [--apply]
 */
import { EdgeMail } from "../index.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RC = join(homedir(), ".edgemailrc");
const args = process.argv.slice(2);
const cmd = args[0];

function flags(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const name = a[i].slice(2);
    const next = a[i + 1];
    o[name] = next && !next.startsWith("--") ? next : true;
  }
  return o;
}
function loadKey() {
  if (process.env.EDGEMAIL_API_KEY) return process.env.EDGEMAIL_API_KEY;
  if (existsSync(RC)) return JSON.parse(readFileSync(RC, "utf8")).apiKey;
  console.error("No API key. Run `edgemail init` or set EDGEMAIL_API_KEY."); process.exit(1);
}
function csv(path) {
  const source = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field); field = "";
    } else if (ch === "\n" && !quoted) {
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(head.map((h, i) => [h, (values[i] || "").trim()])));
}
function migrationInput(path) {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
  if (/\.json$/i.test(path) || raw.startsWith("{") || raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? { leads: parsed } : parsed;
  }
  return { leads: csv(path) };
}

function emailRows(path) {
  return csv(path).map((row, index) => ({
    row,
    index: index + 2,
    email: String(row.email || "").trim().toLowerCase(),
  }));
}

function isEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const f = flags(args);

function usage() {
  console.log(`EdgeMail CLI\n\nCommands:\n  init --key em_xxx\n  send --to a@b.com --subject Hi --text Hello\n  intent --to a@b.com --goal \"thank them\" [--dry]\n  check <domain>\n  migrate --input instantly.json [--apply]\n  migrate --export migration.json\n  migrate --subscribers list.csv --domain you.com [--apply]\n  migrate --suppressions sup.csv [--apply]\n\nAll migration imports are dry-run by default. Use --apply only after reviewing the counts.\n`);
}

(async () => {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") { usage(); return; }
  if (cmd === "init") {
    const key = f.key || args[1];
    if (!key) { console.error("Usage: edgemail init --key em_xxx   (get one at https://edgemailapi.com)"); process.exit(1); }
    writeFileSync(RC, JSON.stringify({ apiKey: key }, null, 2));
    console.log(`Saved to ${RC}. Try: edgemail send --to you@example.com --subject Hi --text "Hello"`);
    return;
  }

  const em = new EdgeMail(loadKey());

  if (cmd === "send") {
    const r = await em.send({ to: f.to, subject: f.subject, text: f.text, html: f.html, from_domain: f.from });
    console.log(JSON.stringify(r, null, 2)); return;
  }
  if (cmd === "intent") {
    const r = await em.intent({ to: f.to, goal: f.goal, tone: f.tone, dry_run: args.includes("--dry") });
    console.log(JSON.stringify(r, null, 2)); return;
  }
  if (cmd === "check") {
    const r = await em.deliverability(args[1] || f.domain);
    console.log(JSON.stringify(r, null, 2)); return;
  }
  if (cmd === "migrate") {
    if (args.includes("--apply") && args.includes("--dry-run")) {
      console.error("Choose either --apply or --dry-run, not both.");
      process.exit(1);
    }
    if (f.export) {
      const output = f.output || (typeof f.export === "string" ? f.export : "edgemail-cold-migration.json");
      const snapshot = await em.coldMigrationExport();
      writeFileSync(output, JSON.stringify(snapshot, null, 2));
      console.log(`Exported provider-neutral migration snapshot to ${output}. Mailbox credentials and API keys are never included.`);
      return;
    }
    if (f.input) {
      const payload = migrationInput(f.input);
      const apply = args.includes("--apply");
      const result = await em.coldMigrationImport({
        ...payload,
        source: f.source || "instantly-cli",
        dry_run: !apply,
      });
      console.log(JSON.stringify({
        ...result,
        mode: apply ? "applied" : "dry_run",
        note: apply
          ? "Campaigns were imported as drafts. Connect fresh mailbox credentials and verify before launch."
          : "No data was written. Re-run with --apply only after reviewing these counts.",
      }, null, 2));
      return;
    }
    if (f.subscribers) {
      const domain = String(f.domain || "").trim().toLowerCase();
      if (!domain) { console.error("--domain is required for subscriber imports."); process.exit(1); }
      const rows = emailRows(f.subscribers);
      const valid = rows.filter((entry) => isEmail(entry.email));
      const invalid = rows.filter((entry) => !isEmail(entry.email));
      const apply = args.includes("--apply");
      const summary = { kind: "subscribers", domain, total: rows.length, valid: valid.length, invalid: invalid.length, mode: apply ? "applied" : "dry_run" };
      if (!apply) {
        console.log(JSON.stringify({ ...summary, imported: 0, failed: 0, note: "No data was written. Re-run with --apply only after reviewing these counts." }, null, 2));
        return;
      }
      const failures = [];
      let imported = 0;
      for (const entry of valid) {
        try {
          await em.subscribe(entry.email, domain, { idempotencyKey: `sdk-subscriber:${domain}:${entry.email}` });
          imported++;
        }
        catch (error) { failures.push({ row: entry.index, error: error.message }); }
      }
      console.log(JSON.stringify({ ...summary, imported, failed: invalid.length + failures.length, failures: [...invalid.slice(0, 5).map((entry) => ({ row: entry.index, error: "invalid email" })), ...failures.slice(0, 5)] }, null, 2));
      if (invalid.length || failures.length) process.exitCode = 1;
      return;
    }
    if (f.suppressions) {
      const rows = emailRows(f.suppressions);
      const valid = rows.filter((entry) => isEmail(entry.email));
      const invalid = rows.filter((entry) => !isEmail(entry.email));
      const apply = args.includes("--apply");
      const summary = { kind: "suppressions", total: rows.length, valid: valid.length, invalid: invalid.length, mode: apply ? "applied" : "dry_run" };
      if (!apply) {
        console.log(JSON.stringify({ ...summary, imported: 0, failed: 0, note: "No data was written. Re-run with --apply only after reviewing these counts." }, null, 2));
        return;
      }
      const failures = [];
      let imported = 0;
      for (const entry of valid) {
        try {
          const reason = String(entry.row.reason || "migrated").trim().slice(0, 160) || "migrated";
          await em._req("POST", "/api/suppressions", {
            body: { email: entry.email, reason },
            headers: { "Idempotency-Key": `sdk-suppression:${entry.email}:${reason}` },
          });
          imported++;
        } catch (error) { failures.push({ row: entry.index, error: error.message }); }
      }
      console.log(JSON.stringify({ ...summary, imported, failed: invalid.length + failures.length, failures: [...invalid.slice(0, 5).map((entry) => ({ row: entry.index, error: "invalid email" })), ...failures.slice(0, 5)] }, null, 2));
      if (invalid.length || failures.length) process.exitCode = 1;
      return;
    }
    console.error("Usage: edgemail migrate --subscribers list.csv --domain you.com [--apply]  |  --suppressions sup.csv [--apply]"); return;
  }
  usage();
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
