import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(
  await readFile(new URL("../src/data/evidence.json", import.meta.url), "utf8"),
);
const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");

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
});

test("product instructions match the staged release surfaces", () => {
  assert.match(
    page,
    /Check every pull request or update the runner working tree for review when Mermaid diagrams change\./,
  );
  assert.doesNotMatch(page, /open a focused update PR/i);
  assert.match(
    page,
    /go install github\.com\/graph2agent\/graph2agent\/cmd\/graph2agent@v0\.1\.0/,
  );
  assert.doesNotMatch(page, /graph2agent@latest/);
});
