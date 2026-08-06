# ADR 0007: Optional GitHub provider enrichment

## Status

Accepted and implemented for the read-only portfolio.

## Decision

TCTBP-Adviser may add GitHub-visible state as a separate, optional evidence
source. GitHub evidence never replaces these local facts:

- the working tree;
- the local HEAD and active Git operations;
- local tracking refs;
- TCTBP profile and scaffold observations; or
- the deterministic recommendation derived from those observations.

Every provider observation has the basis `github-rest-api` and a retrieval
timestamp. Local tracking-ref comparisons retain their existing
`local-working-copy-and-local-tracking-refs` basis and continue to state that no
Git fetch was performed.

## Mapping and GitHub-only repositories

The service reads only the fixed `remote.origin.url` Git configuration key.
Supported HTTPS and SSH GitHub remotes are reduced to `owner/name` inside the
service. Remote URLs, repository paths and credentials are not returned to the
browser.

Additional GitHub-only repositories may be configured explicitly as
`owner/name` values. Automatic account-wide repository discovery is excluded:
the configured list provides bounded, reviewable scope. A configured remote
that already maps to a local checkout is reconciled case-insensitively.

## Provider requests

GitHub calls are service-side, read-only HTTPS requests to the fixed
`api.github.com` host. Request paths are constructed only from validated
repository identities and fixed endpoint templates. Requests use:

- a fixed API version and media type;
- configured timeout and response-size limits;
- bounded repository concurrency;
- a short provider cache with coalesced refreshes; and
- an optional server-side token.

Public repositories can be observed without a token. A token is required only
for repositories or provider surfaces that GitHub does not expose publicly.
The service never returns its configuration or authorisation header.

## Partial failure

Repository metadata establishes whether provider evidence is available.
Branches, tags, releases, workflow runs, check runs, pull requests and issues
then fail independently. An unavailable section is labelled rather than
discarding other provider evidence.

Metadata failure produces an unavailable GitHub observation but does not throw
away a successful local observation or local recommendation. When enrichment
is disabled or an origin is not mapped, the UI says so explicitly.

## Mutation boundary

No GitHub write endpoint is implemented. No Git fetch, checkout, merge,
workflow dispatch, issue update, pull request update or repository mutation is
performed. Scaffold-update execution remains subject to the separate security
review and trusted-migration decision.
