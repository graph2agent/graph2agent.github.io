import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(
  await readFile(new URL("../src/data/evidence.json", import.meta.url), "utf8"),
);
const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
const packageManifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const packageLock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("headline metrics derive from the committed aggregate", () => {
  assert.equal(evidence.overall.total, 330);
  assert.equal(evidence.overall.mermaid_passed, 209);
  assert.equal(evidence.overall.digest_passed, 270);
  assert.equal(
    evidence.overall.absolute_effect,
    (evidence.overall.digest_passed - evidence.overall.mermaid_passed) /
      evidence.overall.total,
  );
  assert.equal(evidence.verdict.promotion, "EFFICACY_ONLY_NO_PROMOTE");
  assert.equal(evidence.verdict.cost_available, false);
});

test("site copy retains the evidence boundary", () => {
  assert.match(page, /not by\s+itself prove broader model, task, or production generalization/);
  assert.match(page, /unavailable—not zero/);
  assert.match(page, /\{evidence\.verdict\.promotion\}<\/strong><span>exact release verdict/);
  assert.doesNotMatch(page, /<strong>EFFICACY_ONLY<\/strong>/);
  assert.doesNotMatch(page, /50% more accurate/i);
  assert.doesNotMatch(page, /50\.41% higher accuracy/i);
  assert.doesNotMatch(page, /preregistered/i);
});

test("product instructions match the staged release surfaces", () => {
  assert.match(page, /brew install graph2agent\/tap\/graph2agent/);
  assert.match(page, /sudo apt-get install graph2agent/);
  assert.match(page, /npx -y graph2agent-mcp@0\.2\.0/);
  assert.match(page, /graph2agent check \./);
  assert.match(page, /focused refresh PR/);
  assert.match(page, /commands activate with the first public <code>v0\.2\.0<\/code> release/);
  assert.doesNotMatch(page, /@v0\.1\.0/);
  assert.doesNotMatch(page, /graph2agent@latest/);
});

test("public launch metadata exposes the brand and Apache license", () => {
  assert.equal(packageManifest.license, "Apache-2.0");
  assert.equal(packageLock.packages[""].license, "Apache-2.0");
  assert.match(page, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(page, /rel="apple-touch-icon"/);
  assert.match(page, /property="og:image" content="https:\/\/graph2agent\.github\.io\/brand\/logo\.png"/);
  assert.match(page, /name="twitter:card" content="summary"/);
  assert.match(page, /<img class="brand-mark" src="\/favicon\.svg" alt=""/);
  assert.match(page, /href="\/LICENSE\.txt">License<\/a>/);
  assert.doesNotMatch(page, /github\.com\/graph2agent\/research/);
  assert.doesNotMatch(page, /Public distribution activation pending/);
});
