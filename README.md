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
limits in view, and advertises the Homebrew, signed APT, one-command MCP, merge
gate, and daily refresh-PR surfaces. Every headline derives from the checked-in
aggregate evidence JSON.

[Apache-2.0 license](LICENSE.md)

```sh
brew install graph2agent/tap/graph2agent
npx -y graph2agent-mcp@0.2.0
```

Those commands activate with the first public `v0.2.0` release.

## Development

Requires Node 22.12 or newer.

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

## Signed APT repository staging

[`scripts/build-apt-repository.sh`](scripts/build-apt-repository.sh) builds a
complete, signed archive under `public/apt` without uploading or deploying it.
The generated tree is ignored by Git. Nothing in CI or the manual Pages
workflow invokes the builder.

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

## Deployment activation

The site is not deployed until GitHub Pages is enabled for this repository, the
launch changes are on `main`, and **Deploy GitHub Pages** is run. The workflow
is manual-only, accepts only `main`, and requires the explicit
`PUBLISH_PUBLICLY` confirmation.

For the first deployment, enable GitHub Actions as the Pages source in the
repository settings and run **Deploy GitHub Pages**. Add a default-branch push
trigger only in a separately reviewed change.

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
