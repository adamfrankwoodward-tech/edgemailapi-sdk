import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "edgemail-csv-"));
const input = join(directory, "input.csv");
const requests = join(directory, "requests.jsonl");
const cli = new URL("./bin/cli.js", import.meta.url).href;
const harness = `
  import { appendFileSync } from "node:fs";
  globalThis.fetch = async (url, options = {}) => {
    appendFileSync(process.env.CSV_TEST_REQUESTS, JSON.stringify({ url: String(url), options }) + "\\n");
    return new Response(JSON.stringify({ ok: true, success: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  process.argv = [process.execPath, ${JSON.stringify(cli)}, ...JSON.parse(process.env.CSV_TEST_ARGS)];
  await import(${JSON.stringify(cli)});
`;
let runs = 0;

function run(source, flags = [], kind = "suppressions") {
  writeFileSync(input, source);
  writeFileSync(requests, "");
  const args = ["migrate", `--${kind}`, input, ...flags];
  if (kind === "subscribers") args.push("--domain", "example.test");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", harness], {
    encoding: "utf8",
    env: { ...process.env, EDGEMAIL_API_KEY: "em_csv_test", CSV_TEST_ARGS: JSON.stringify(args), CSV_TEST_REQUESTS: requests },
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  runs++;
  return { ...result, calls: readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) };
}

try {
  const malformed = [
    ["email,reason\nfirst@example.test,\"unclosed\nsecond@example.test,bounced\n", /unclosed quoted field/i],
    ["email,reason\nfirst@example.test,bounced\nsecond@example.test,\"unclosed", /unclosed quoted field/i],
    ["email,reason\nfirst@example.test,bounced\nsecond@example.test,un\"quoted\"", /quote/i],
    ["email,reason\nfirst@example.test,bounced\nsecond@example.test,\"closed\"junk", /closing quote/i],
    ["email,reason\nfirst@example.test,bounced\nsecond@example.test,\"closed\" \n", /closing quote/i],
    ["email,reason\nfirst@example.test,bounced\nsecond@example.test", /columns/i],
    ["email,reason\nfirst@example.test,bounced\nsecond@example.test,bounced,extra", /columns/i],
    ["email, EMAIL\nfirst@example.test,second@example.test", /duplicate header/i],
    ["email,\nfirst@example.test,bounced", /empty header/i],
    ["address,reason\nfirst@example.test,bounced", /email.*header/i],
    ["", /header/i],
    ["\n \n", /header/i],
    [",\n", /empty header/i],
  ];
  for (const [source, error] of malformed) {
    for (const flags of [[], ["--dry-run"], ["--apply"]]) {
      const result = run(source, flags);
      assert.equal(result.status, 1, source);
      assert.match(result.stderr, error, source);
      assert.equal(result.stdout, "", source);
      assert.deepEqual(result.calls, [], source);
    }
  }

  for (const kind of ["subscribers", "input"]) {
    for (const flags of [[], ["--apply"]]) {
      const result = run(malformed[1][0], flags, kind);
      assert.equal(result.status, 1);
      assert.deepEqual(result.calls, []);
    }
  }

  const controls = [
    ["email,reason\nfirst@example.test,\"closed\nmultiline\"\nsecond@example.test,bounced\n", ["closed\nmultiline", "bounced"]],
    ["\uFEFF EMAIL ,Reason\r\n\r\n\"first@example.test\",\"said \"\"stop\"\", please\"\r\nsecond@example.test,\"closed\r\nmultiline\"", ['said "stop", please', "closed\r\nmultiline"]],
    ["email,reason\rfirst@example.test,\rsecond@example.test,\"\"", ["migrated", "migrated"]],
    ["email\nfirst@example.test\nsecond@example.test", ["migrated", "migrated"]],
  ];
  for (const [source, reasons] of controls) {
    for (const flags of [[], ["--apply"]]) {
      const result = run(source, flags);
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(result.stdout);
      const apply = flags.includes("--apply");
      assert.equal(summary.total, 2);
      assert.equal(summary.valid, 2);
      assert.equal(summary.invalid, 0);
      assert.equal(summary.imported, apply ? 2 : 0);
      assert.equal(summary.failed, 0);
      assert.equal(result.calls.length, apply ? 2 : 0);
      if (apply) {
        assert.deepEqual(result.calls.map((call) => [call.options.method, call.url]), [
          ["POST", "https://api.edgemailapi.com/api/suppressions"],
          ["POST", "https://api.edgemailapi.com/api/suppressions"],
        ]);
        assert.deepEqual(result.calls.map((call) => JSON.parse(call.options.body)), reasons.map((reason, i) => ({ email: ["first@example.test", "second@example.test"][i], reason })));
      }
    }
  }

  for (const kind of ["subscribers", "input"]) {
    const result = run(controls[0][0], ["--apply"], kind);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, kind === "subscribers" ? 2 : 1);
    if (kind === "input") {
      assert.deepEqual(JSON.parse(result.calls[0].options.body).leads, [
        { email: "first@example.test", reason: "closed\nmultiline" },
        { email: "second@example.test", reason: "bounced" },
      ]);
    }
  }
  const headerOnly = run("email,reason\n", ["--apply"]);
  assert.equal(headerOnly.status, 0, headerOnly.stderr);
  assert.equal(JSON.parse(headerOnly.stdout).total, 0);
  assert.deepEqual(headerOnly.calls, []);
  console.log(`CLI CSV contract: ${runs} mocked migrations passed`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
