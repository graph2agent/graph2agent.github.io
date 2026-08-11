import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8",
);
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const release = JSON.parse(
  await readFile(new URL("../src/data/release.json", import.meta.url), "utf8"),
);

test("Pages is the validated final leg of the coordinated release", () => {
  assert.match(
    workflow,
    /repository_dispatch:\n\s+types: \[graph2agent-release\]/,
  );
  assert.match(workflow, /workflow_dispatch:\n\s+inputs:/);
  for (const input of ["version", "core_commit", "action_commit"]) {
    assert.match(workflow, new RegExp(`\\n\\s{6}${input}:\\n`));
  }

  assert.match(workflow, /github\.repository == 'graph2agent\/graph2agent\.github\.io'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.event_name == 'repository_dispatch'/);
  assert.match(
    workflow,
    /github\.event\.client_payload\.confirm_publication == 'PUBLISH_PUBLICLY'/,
  );
  assert.match(workflow, /PUBLISH_PUBLICLY/);
  assert.doesNotMatch(workflow, /^\s{2}push:/m);

  assert.match(
    workflow,
    /\^v\(0\|\[1-9\]\[0-9\]\*\)\\\.\(0\|\[1-9\]\[0-9\]\*\)\\\.\(0\|\[1-9\]\[0-9\]\*\)\$/,
  );
  assert.equal(workflow.match(/\^\[0-9a-f\]\{40\}\$/g)?.length, 2);
  assert.match(workflow, /github\.event\.client_payload\.core_commit/);
  assert.match(workflow, /github\.event\.client_payload\.action_commit/);
});

test("release identity is checked against metadata and immutable public refs", () => {
  assert.equal(release.version, "v0.4.0");
  assert.equal(
    release.action_workflow_ref,
    "48bc59a4742c2fd0311e81214b6571ce10601a4b",
  );

  assert.match(workflow, /src\/data\/release\.json/);
  assert.match(workflow, /release\.version !== process\.env\.RELEASE_VERSION/);
  assert.match(
    workflow,
    /release\.action_workflow_ref !== process\.env\.ACTION_COMMIT/,
  );
  assert.match(workflow, /repository: graph2agent\/graph2agent/);
  assert.match(workflow, /repository: graph2agent\/github-action/);
  assert.match(workflow, /ref: \$\{\{ env\.CORE_COMMIT \}\}/);
  assert.match(workflow, /ref: \$\{\{ env\.ACTION_COMMIT \}\}/);
  assert.match(workflow, /refs\/tags\/\$\{RELEASE_VERSION\}/);
  assert.match(workflow, /\$\{RELEASE_VERSION\}\^\{commit\}/);
});

test("Pages deployment runs every release gate and pins every external action", () => {
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /GRAPH2AGENT_BIN: \$\{\{ runner\.temp \}\}\/graph2agent/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /actions\/upload-pages-artifact@/);
  assert.match(workflow, /actions\/deploy-pages@/);

  const externalActions = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map(
    (match) => match[1],
  );
  assert.ok(externalActions.length >= 8);
  for (const action of externalActions) {
    assert.match(
      action,
      /^[^@\s]+@[0-9a-f]{40}$/,
      `external action is not pinned to a full commit: ${action}`,
    );
  }
});

test("the one-time release orchestration and recovery contract is documented", () => {
  assert.match(readme, /repository_dispatch.*graph2agent-release/s);
  assert.match(readme, /automated final leg of the coordinated release train/);
  assert.match(readme, /"confirm_publication": "PUBLISH_PUBLICLY"/);
  assert.match(readme, /workflow_dispatch.*recovery path/s);
  assert.match(readme, /short-lived installation token scoped only to\s+this repository/);
  assert.match(readme, /Do not store a cross-repository personal access token/);
  assert.match(readme, /Default-branch pushes do not deploy/);
});
