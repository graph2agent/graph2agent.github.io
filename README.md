# graph2agent.github.io

Private source for the graph2agent product and evidence site. The site explains
the Mermaid-to-agent-context workflow, shows an illustrative compilation, and
derives every benchmark headline from the checked-in aggregate evidence JSON.

## Development

Requires Node 22.12 or newer.

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

## Evidence policy

`src/data/evidence.json` is copied from the provenance-bound confirmatory chart
data in the research source. Site copy must preserve the exact task/model/cost
boundaries. `tests/evidence.test.mjs` rejects headline drift and common relative
versus absolute effect misstatements.

No private holdout cases, model traces, raw responses, credentials, or
unpublished oracle material belong in this repository or its generated bundle.

## Publishing

The repository and all builds remain private for now. The Pages workflow is
manual-only. Do not run it until public visibility is intended: GitHub does not
offer private access control for an organization Pages site, and a private
repository does not make that site private.

When publication is approved, enable GitHub Actions as the Pages source in the
repository settings, run **Deploy GitHub Pages**, and then add the default-
branch push trigger in a reviewed change.
