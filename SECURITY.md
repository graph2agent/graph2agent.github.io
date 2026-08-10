# Security policy

Report suspected data exposure or unsafe site behavior privately to the
repository owner. Do not include private holdout content or credentials in an
issue.

The production site is static, has no analytics, authentication, forms,
cookies, or runtime API calls. Dependencies are pinned by the lockfile and
GitHub Actions are pinned by immutable commit SHA. Workflow checkouts persist
no Git credential into the worktree used by dependency or build commands.
