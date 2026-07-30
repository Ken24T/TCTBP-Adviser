# ADR 0006: Bounded local portfolio discovery

## Status

Accepted and implemented for the local portfolio MVP.

## Decision

TCTBP-Adviser discovers Git repositories beneath one or more canonical,
configured roots. Discovery is service-owned and read-only. It:

- identifies repositories by a directory or worktree-style file named `.git`;
- stops recursion at a discovered repository boundary;
- skips configured directory names;
- never follows directory symbolic links;
- enforces maximum depth, visited-directory and repository counts;
- reconciles duplicate canonical paths from overlapping roots;
- exposes only stable opaque repository IDs and names to the browser.

Opaque IDs are the truncated SHA-256 digest of the canonical local path. They
remain stable across Adviser launches so non-sensitive browser preferences can
persist, while the canonical path itself remains service-only. The per-launch
session token—not the repository ID—provides API authorisation.

## Portfolio snapshots

`GET /api/portfolio` returns a cached snapshot. A snapshot contains reduced
local observations, TCTBP compatibility and one deterministic recommendation
for each repository.

`POST /api/repositories/refresh` accepts no body and forces both discovery and
inspection refresh. Inspection uses bounded concurrency. One repository
failure becomes an unavailable portfolio entry and does not discard healthy
entries.

Cache age, cache lifetime, discovery issues and unavailable repositories are
explicit in the contract and UI. No fetch is performed.

## User preferences

Pin, hide and custom display-name preferences are stored in browser local
storage against stable opaque IDs. They contain no paths, credentials or Git
data and have no effect on policy or recommendations. They never modify a
repository or the Adviser service configuration.

## Compatibility

The previous `TCTBP_ADVISER_ALLOWED_ROOT` plus
`TCTBP_ADVISER_REPOSITORY` environment remains accepted for migration. New
configurations use JSON arrays through `TCTBP_ADVISER_REPOSITORY_ROOTS` and
`TCTBP_ADVISER_EXCLUDE_DIRECTORIES`.

## Deferred

Local/GitHub duplicate reconciliation, remote-only repositories, provider
freshness, checks, issues, releases and credentials belong to the separate
GitHub-enrichment phase. All repository and scaffold mutation remains disabled.
