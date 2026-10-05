import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const action = readFileSync(new URL("./action.yml", import.meta.url), "utf8");
const envBlock = action.match(/^      env:\n((?: {8}.*\n)+)/m)?.[1];
const runBlock = action.match(/^      run: \|\n((?: {8}.*\n?)+)/m)?.[1];
assert.ok(envBlock);
assert.ok(runBlock);
const run = runBlock.replace(/^ {8}/gm, "");
assert.doesNotMatch(run, /\$\{\{/);

const inputs = {
  api_key: "EDGEMAIL_API_KEY",
  to: "EDGEMAIL_TO",
  subject: "EDGEMAIL_SUBJECT",
  text: "EDGEMAIL_TEXT",
  html: "EDGEMAIL_HTML",
  from: "EDGEMAIL_FROM",
};
for (const [input, variable] of Object.entries(inputs)) {
  const expression = "${{ inputs." + input + " }}";
  assert.ok(envBlock.includes(`        ${variable}: ${expression}`));
}

const stub = String.raw`
jq() {
  printf '%s\0' jq "$@" >&3
  printf '%s' 'stub-json'
}
curl() {
  printf '%s\0' curl "$@" >&3
}
`;

for (const values of [
  {
    api_key: "em_test_key",
    to: "recipient@example.com",
    subject: "Normal subject",
    text: "Plain text",
    html: "",
    from: "",
  },
  Object.fromEntries(Object.keys(inputs).map((input) => [
    input,
    `literal $(printf ACTION_INPUT_EXECUTED >&2) \`printf ACTION_INPUT_EXECUTED >&2\` " ' $HOME \\ ${input}\nnext line`,
  ])),
]) {
  const env = Object.fromEntries(Object.entries(inputs).map(([input, variable]) => [variable, values[input]]));
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", `${stub}\n${run}`, "bash"], {
    env: { ...process.env, ...env, GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const argumentsByCommand = result.output[3].toString().split("\0");
  const curlIndex = argumentsByCommand.indexOf("curl");
  assert.equal(argumentsByCommand[0], "jq");
  assert.ok(curlIndex > 0);
  assert.deepEqual(argumentsByCommand.slice(1, curlIndex), [
    "-nc",
    "--arg", "to", values.to,
    "--arg", "s", values.subject,
    "--arg", "t", values.text,
    "--arg", "h", values.html,
    "--arg", "f", values.from,
    '{to:$to, subject:$s} + (if $t!="" then {text:$t} else {} end) + (if $h!="" then {html:$h} else {} end) + (if $f!="" then {from_domain:$f} else {} end)',
  ]);
  assert.deepEqual(argumentsByCommand.slice(curlIndex + 1, -1), [
    "-fsS", "-X", "POST", "https://api.edgemailapi.com/api/send",
    "-H", `Authorization: Bearer ${values.api_key}`,
    "-H", "Content-Type: application/json",
    "-H", "Idempotency-Key: gh-123-2",
    "-d", "stub-json",
  ]);
}

console.log("Composite action: literal inputs passed safely");
