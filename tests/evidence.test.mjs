import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(
  await readFile(new URL("../src/data/evidence.json", import.meta.url), "utf8"),
);
const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
const llms = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");
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

test("the first screen explains the product before presenting proof", () => {
  assert.match(page, /graph2agent — Mermaid diagrams, explained for agents/);
  assert.match(page, /Mermaid in · graph2agent · explicit context out/);
  assert.match(page, /Mermaid diagrams,<br \/><em>explained for agents\.<\/em>/);
  assert.match(page, /graph2agent turns Mermaid diagrams into explicit text for coding agents/);
  assert.match(page, /Keep the\s+diagram for people; add deterministic context/);
  assert.match(page, /Humans can scan the\s+picture visually/);
  assert.match(page, /must reconstruct those\s+relationships from compact syntax/);
  assert.match(page, /elements, connections,\s+branches, order, topology/);
  assert.match(page, /Diagram stays for humans/);
  assert.match(page, /Rich text goes to agents/);
  assert.match(page, /Deterministic · no model call/);
  assert.match(page, /diagram \+ generated context/);
  assert.match(page, /Agent explanation · hidden in rendered Markdown/);
  assert.match(page, /Branch candidate: `Authorized\?`/);
  assert.match(page, /Humans see the picture\.<br \/>Agents need the structure spelled out/);
  assert.doesNotMatch(page, /Give agents the graph/);
});

test("product instructions match the staged release surfaces", () => {
  assert.match(page, /brew install graph2agent\/tap\/graph2agent/);
  assert.match(page, /releases\/tag\/v0\.2\.1/);
  assert.match(page, /signed APT repository is staged but not live/);
  assert.doesNotMatch(page, /sudo apt-get install graph2agent/);
  assert.match(page, /npx -y graph2agent-mcp@0\.2\.0/);
  assert.match(page, /command becomes live when <code>v0\.2\.0<\/code> is published to npm/);
  assert.match(page, /graph2agent check \./);
  assert.match(page, /focused refresh PR/);
  assert.match(page, /Core <code>v0\.2\.1<\/code>, Action <code>v0\.3\.0<\/code>, Homebrew, and direct Debian downloads are public/);
  assert.match(page, /MCP <code>v0\.2\.0<\/code> is prepared for npm publication/);
  assert.match(page, /graph2agent describe --profile interpreted-v3 -/);
  assert.match(page, /npm pending → npx -y graph2agent-mcp@0\.2\.0/);
  assert.match(page, /uses: graph2agent\/github-action\/\.github\/workflows\/check-markdown\.yml@/);
  assert.match(page, /uses: graph2agent\/github-action\/\.github\/workflows\/maintain-markdown\.yml@/);
  assert.equal(page.match(/graph2agent-version: v0\.2\.1/g)?.length, 2);
  assert.match(page, /7c57998614ba579be55829423eaaa1262c35eff4/);
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
  assert.match(page, /rel="describedby" href="\/llms\.txt"/);
  assert.match(page, /href="\/llms\.txt">llms\.txt<\/a>/);
  assert.doesNotMatch(page, /github\.com\/graph2agent\/research/);
  assert.doesNotMatch(page, /Public distribution activation pending/);
});

test("llms.txt is a concise public and evidence-bounded project index", () => {
  assert.ok(!llms.startsWith("\uFEFF"), "llms.txt must not include a byte-order mark");
  assert.match(llms, /^# graph2agent\n\n> graph2agent is an Apache-2\.0 deterministic compiler/);
  assert.equal(llms.match(/^# /gm)?.length, 1);

  const sections = llms.split(/^## /m).slice(1);
  assert.ok(sections.length >= 4);
  for (const section of sections) {
    const [title, ...body] = section.trim().split("\n");
    assert.ok(title.length > 0);
    for (const line of body.filter((value) => value.length > 0)) {
      assert.match(line, /^- \[[^\]]+\]\(https:\/\/[^)]+\): .+$/);
    }
  }

  assert.match(llms, /graph2agent describe --profile interpreted-v3 FILE\|-/);
  assert.match(llms, /graph2agent update \./);
  assert.match(llms, /Core v0\.2\.1, GitHub Action v0\.3\.0, Homebrew, and direct Debian downloads are public/);
  assert.match(llms, /MCP v0\.2\.0 one-command npm package and signed APT repository are not yet live/);
  assert.match(llms, new RegExp(`frozen paired benchmark of ${evidence.overall.total} private contracts`));
  assert.match(llms, new RegExp(`${evidence.overall.digest_passed}/${evidence.overall.total} exact versus ${evidence.overall.mermaid_passed}/${evidence.overall.total}`));
  assert.match(llms, /\+18\.48 percentage points and 50\.41% relative failure reduction/);
  assert.match(llms, /does not by itself establish broader model, task, profile, Mermaid-construct, or production generalization/);
  assert.match(llms, /Provider monetary cost was unavailable, not zero/);
  assert.doesNotMatch(llms, /github\.com\/graph2agent\/research/);
  assert.doesNotMatch(llms, /50(?:\.41)?% (?:more accurate|higher accuracy)/i);
  assert.ok(llms.length < 8_000, `llms.txt is too large: ${llms.length} bytes`);
});
