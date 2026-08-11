<p align="center">
  <img src="https://raw.githubusercontent.com/graph2agent/graph2agent/main/.github/assets/favicon.svg" width="112" height="112" alt="graph2agent logo">
</p>

# Publish the measured graph2agent result—with the caveats attached

> **Measured: 50.41% fewer exact-comprehension failures.** On one frozen,
> paired benchmark of 330 private contracts, Mermaid plus graph2agent's
> `standard` digest scored 270/330 exact versus 209/330 with Mermaid alone
> (+18.48 percentage points; 61 digest-only wins and 0 Mermaid-only wins).

This is the Apache-2.0-licensed source for the graph2agent product and evidence
site. The page leads with that measured result, keeps its model/task/profile
limits in view, and advertises the live Homebrew and direct Debian surfaces,
the live macOS/Linux npm MCP package, native Windows MCP downloads, the staged
signed APT repository, and the live merge-gate and daily refresh-PR surfaces.
Every headline derives from the checked-in aggregate evidence JSON.

[Apache-2.0 license](LICENSE.md)

[LLM-oriented project index](https://graph2agent.github.io/llms.txt)

```sh
brew install graph2agent/tap/graph2agent
# Live on macOS and Linux:
npx -y graph2agent-mcp@0.4.0
```

The Homebrew formula is pinned to the verified, attested core `v0.4.0`
release. Verified `amd64` and `arm64` Debian packages are attached directly to
that release. The MCP command launches the live `v0.4.0` npm package on macOS
and Linux. Verified native Windows executables are available from the
[MCP v0.4.0 GitHub release](https://github.com/graph2agent/mcp/releases/tag/v0.4.0);
one-command npm activation on Windows is pending.

## Development

Requires Node 22.12 or newer.

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

`src/data/release.json` is the authoritative public product version. Core, MCP,
and GitHub Action copy all use that version; the reusable workflow remains
pinned separately to an immutable commit SHA.

The landing-page example has one canonical Mermaid source under
`src/data/examples`. Its exact `interpreted-v3` output, static themed SVG, and
hash metadata are committed beside it. Regenerate the text with the release
candidate CLI and the SVG with the pinned renderer, then run the optional live
compiler assertion as part of the normal tests:

```sh
graph2agent describe --profile interpreted-v3 \
  src/data/examples/request-routing.mmd \
  > src/data/examples/request-routing.interpreted-v3.txt
npx -y @mermaid-js/mermaid-cli@11.16.0 \
  -c scripts/mermaid.config.json \
  -i src/data/examples/request-routing.mmd \
  -o public/diagrams/request-routing.svg \
  -b transparent
GRAPH2AGENT_BIN="$(command -v graph2agent)" npm test
```

## Signed APT repository staging

[`scripts/build-apt-repository.sh`](scripts/build-apt-repository.sh) builds a
complete, signed archive under `public/apt` without uploading or deploying it.
The generated tree is ignored by Git. Nothing in CI or either Pages deployment
path invokes the builder.

The builder requires two separate trust inputs:

- a detached OpenPGP signature over a SHA-256 manifest, plus the expected
  release public key and full primary fingerprint; and
- an external GnuPG home containing the APT archive secret key, plus its full
  primary fingerprint.

It accepts exactly one `graph2agent` package for each required architecture
(`amd64` and `arm64` by default), requires the same version in both, verifies
the signed manifest and copied package hashes, and inspects each package for an
executable `/usr/bin/graph2agent`. Maintainer scripts, symbolic links, and
special payload files are rejected because this standalone CLI needs none of
them. The existing output is replaced only after the package indexes and both
`InRelease` and `Release.gpg` have been generated and independently verified
with the exported archive public key.

Example, using key material provisioned outside this checkout:

```sh
scripts/build-apt-repository.sh \
  --checksums /secure/release/checksums.txt \
  --checksums-signature /secure/release/checksums.txt.asc \
  --release-keyring /secure/release/release-key.asc \
  --release-fingerprint "$RELEASE_FINGERPRINT" \
  --archive-gnupg-home /secure/apt-archive-gnupg \
  --archive-fingerprint "$ARCHIVE_FINGERPRINT" \
  -- graph2agent_*_amd64.deb graph2agent_*_arm64.deb
```

The integration test creates throwaway release and archive keys and synthetic
packages, verifies both repository signatures and every checksum chain, then
proves that altered manifests and packages leave the previous output intact.
It skips locally when GnuPG or Debian packaging tools are unavailable; CI
installs `gnupg` and `dpkg-dev` before running it.

## Evidence policy

`src/data/evidence.json` is copied from the provenance-bound confirmatory chart
data in the private research internals. Site copy must preserve the exact
task/model/cost boundaries. `tests/evidence.test.mjs` rejects headline drift
and common relative-versus-absolute effect misstatements.

No private holdout cases, model traces, raw responses, credentials, or
unpublished oracle material belong in this repository or its generated bundle.

## Coordinated release deployment

The site is public at <https://graph2agent.github.io/>. GitHub Pages uses the
repository's GitHub Actions source. The **Deploy coordinated GitHub Pages
release** workflow accepts only `main` in this canonical repository and has two
entry points:

- `repository_dispatch` with event type `graph2agent-release` is the normal,
  automated final leg of the coordinated release train; and
- `workflow_dispatch` is a recovery path that requires `version`,
  `core_commit`, `action_commit`, and the explicit `PUBLISH_PUBLICLY`
  confirmation.

The automated dispatch payload is a one-shot release contract:

```json
{
  "event_type": "graph2agent-release",
  "client_payload": {
    "version": "v0.4.0",
    "core_commit": "<40-character lowercase core commit>",
    "action_commit": "<40-character lowercase Action commit>",
    "confirm_publication": "PUBLISH_PUBLICLY"
  }
}
```

`version` must be canonical `vMAJOR.MINOR.PATCH` without leading zeroes.
Both commits must be full lowercase object IDs. Before building, the workflow
requires `src/data/release.json` to contain that version and Action commit,
checks that the public core and Action tags peel to the supplied commits, and
builds the exact core revision to verify the committed diagram narrative. It
then runs the same type, test, and static-build gates as CI before uploading the
Pages artifact. The explicit `confirm_publication` assertion prevents a generic
or incomplete repository dispatch from publishing the site. A failed or
malformed dispatch cannot reach deployment.

One-time orchestration setup belongs in the upstream release coordinator:

1. Install a dedicated GitHub App on `graph2agent.github.io`, granting only
   repository **Contents: write**, which GitHub requires to create a repository
   dispatch.
2. Keep the App private key in the dispatching repository's protected release
   environment and generate a short-lived installation token scoped only to
   this repository. Do not store a cross-repository personal access token.
3. Send exactly one `graph2agent-release` dispatch only after the immutable
   core and Action tags, MCP packages, and Homebrew formula have passed their
   release gates. The matching site release metadata must already be on
   `main`.

The release concurrency group never cancels an in-progress deployment. A
manual recovery run must reuse the same immutable inputs; it is not a way to
override mismatched release metadata. Default-branch pushes do not deploy.

APT publication is a separate activation decision. Before adding any publisher
or including `public/apt` in a deployment artifact, all of these requirements
must be met:

1. The `.deb` files must come from an immutable release and its checksum
   manifest must be signed by the approved release key.
2. A dedicated archive signing subkey must be provisioned through a protected
   environment; no private key or passphrase may enter Git, workflow artifacts,
   logs, or the Pages bundle.
3. The public archive key fingerprint, key-rotation procedure, package
   retention policy, and repository freshness policy must be documented.
4. The final HTTPS origin and `graph2agent.sources` bootstrap instructions must
   be tested from clean supported Debian and Ubuntu systems.
5. The publication workflow and its storage credentials must receive a
   separate review and explicit approval. This repository intentionally has no
   automatic APT build or deployment trigger today.
