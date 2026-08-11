import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const examplesDirectory = new URL("../src/data/examples/", import.meta.url);
const page = await readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8");
const release = JSON.parse(
  await readFile(new URL("../src/data/release.json", import.meta.url), "utf8"),
);
const metadataNames = (await readdir(examplesDirectory))
  .filter((name) => name.endsWith(".json"))
  .sort();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadExample(metadataName) {
  const metadata = JSON.parse(
    await readFile(new URL(metadataName, examplesDirectory), "utf8"),
  );
  const source = await readFile(new URL(`../${metadata.source_path}`, import.meta.url));
  const compiled = await readFile(new URL(`../${metadata.compiled_path}`, import.meta.url));
  const rendered = await readFile(new URL(`../${metadata.rendered_svg_path}`, import.meta.url));
  return { metadata, source, compiled, rendered };
}

test("each Mermaid fixture has versioned source, exact compiled text, and a static SVG", async () => {
  assert.deepEqual(metadataNames, ["request-routing.json"]);

  for (const metadataName of metadataNames) {
    const { metadata, source, compiled, rendered } = await loadExample(metadataName);
    const sourceText = source.toString("utf8");
    const compiledText = compiled.toString("utf8");
    const renderedText = rendered.toString("utf8");

    assert.equal(metadata.release_version, release.version);
    assert.equal(metadata.release_version, "v0.4.0");
    assert.equal(metadata.compatibility_profile, "core-contract-v2");
    assert.equal(metadata.ir_schema_version, "1.0");
    assert.equal(metadata.narrative_profile, "interpreted-v3");
    assert.equal(metadata.mermaid_renderer, "@mermaid-js/mermaid-cli");
    assert.equal(metadata.mermaid_renderer_version, "11.16.0");
    assert.equal(metadata.diagnostics, 0);

    assert.equal(sha256(source), metadata.source_sha256);
    assert.equal(sha256(compiled), metadata.compiled_sha256);
    assert.equal(sha256(rendered), metadata.rendered_svg_sha256);
    assert.match(metadata.semantic_sha256, /^[0-9a-f]{64}$/);

    assert.match(sourceText, /^flowchart TD\n/);
    assert.match(compiledText, /^Diagram contract\nType: Mermaid flowchart\./);
    assert.match(compiledText, /Branch candidates, based only on multiple outgoing directed connections: `Authorized\?`\./);
    assert.match(compiledText, /Shape cues guide interpretation but alone define no executable behavior\./);
    assert.match(renderedText, /^<svg /);
    assert.match(renderedText, /viewBox="0 0 225\.796875 386\.578125"/);
    assert.match(renderedText, /aria-roledescription="flowchart-v2"/);
    assert.match(renderedText, /#c8ff43/);
    assert.doesNotMatch(renderedText, /<script\b/i);
    assert.doesNotMatch(renderedText, /\sonload=/i);
  }
});

test("every displayed Mermaid source is paired with its rendering and exact compiled snapshot", () => {
  assert.doesNotMatch(page, /^flowchart\s/m);
  assert.equal(page.match(/\{diagramSource\.trimEnd\(\)\}/g)?.length, 2);
  assert.equal(page.match(/\{compiledDiagramText\.trimEnd\(\)\}/g)?.length, 2);
  assert.equal(page.match(/src=\{diagramExample\.rendered_svg\}/g)?.length, 2);
  assert.equal(page.match(/alt=\{diagramExample\.rendered_alt\}/g)?.length, 2);
  assert.equal(page.match(/data-source-sha256=\{diagramExample\.source_sha256\}/g)?.length, 2);
  assert.match(page, /<figure[\s\S]*Rendered Mermaid · same source, compiled for people<\/figcaption>/);
  assert.match(page, /<figure[\s\S]*Rendered Mermaid · the picture humans scan<\/figcaption>/);
});

test(
  "compiled snapshot matches the current graph2agent worktree when GRAPH2AGENT_BIN is supplied",
  { skip: !process.env.GRAPH2AGENT_BIN },
  async () => {
    const { metadata, compiled } = await loadExample("request-routing.json");
    const sourcePath = new URL(`../${metadata.source_path}`, import.meta.url);
    const { stdout, stderr } = await execFile(
      process.env.GRAPH2AGENT_BIN,
      ["describe", "--profile", metadata.narrative_profile, sourcePath.pathname],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );

    assert.equal(stderr, "");
    assert.equal(stdout, compiled.toString("utf8"));
  },
);
