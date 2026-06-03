#!/usr/bin/env node
/**
 * EdgeMail CLI — `edgemail <command>`
 *   edgemail init                              save your API key
 *   edgemail send --to a@b.com --subject Hi --text "Hello"
 *   edgemail intent --to a@b.com --goal "thank them for signing up"
 *   edgemail check <domain>                    deliverability report
 *   edgemail migrate --subscribers file.csv --domain x   import a list (#49)
 *   edgemail migrate --suppressions file.csv             import suppressions (#49)
 */
import { EdgeMail } from "../index.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RC = join(homedir(), ".edgemailrc");
const args = process.argv.slice(2);
const cmd = args[0];

function flags(a) {
  const o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) o[a[i].slice(2)] = a[i + 1];
  return o;
}
function loadKey() {
  if (process.env.EDGEMAIL_API_KEY) return process.env.EDGEMAIL_API_KEY;
  if (existsSync(RC)) return JSON.parse(readFileSync(RC, "utf8")).apiKey;
  console.error("No API key. Run `edgemail init` or set EDGEMAIL_API_KEY."); process.exit(1);
}
function csv(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(",").map(h => h.trim().toLowerCase());
  return lines.map(l => { const c = l.split(","); const o = {}; head.forEach((h, i) => o[h] = (c[i] || "").trim()); return o; });
}

const f = flags(args);

(async () => {
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
    if (f.subscribers) {
      const rows = csv(f.subscribers);
      let ok = 0; for (const row of rows) { try { await em.subscribe(row.email, f.domain); ok++; } catch {} }
      console.log(`Imported ${ok}/${rows.length} subscribers to ${f.domain}.`); return;
    }
    if (f.suppressions) {
      const rows = csv(f.suppressions); let ok = 0;
      for (const row of rows) { try { await em._req("POST", "/api/suppressions", { body: { email: row.email, reason: "migrated" } }); ok++; } catch {} }
      console.log(`Imported ${ok}/${rows.length} suppressions.`); return;
    }
    console.error("Usage: edgemail migrate --subscribers list.csv --domain you.com  |  --suppressions sup.csv"); return;
  }
  console.log("Commands: init, send, intent, check <domain>, migrate. Docs: https://edgemailapi.com");
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
