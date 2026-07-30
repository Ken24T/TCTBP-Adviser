# ADR 0002: TCTBP scaffold health and upgrades

## Status

Accepted as a staged capability: assessment in the MVP, updates deferred.

## Context

Repositories may contain missing, locally modified, or outdated TCTBP files.
The Adviser is well placed to identify this drift, but changing another
repository crosses the read-only trust boundary and can overwrite legitimate
project customisation.

## Decision

### Read-only scaffold health

The Adviser may report:

- whether `.github/TCTBP.json` exists and parses within size limits;
- installed schema and Adviser contract versions;
- advertised and missing capabilities;
- recorded TCTBP-Web source revision, when available;
- expected managed files that are missing;
- managed files that differ from the pinned source;
- project-owned overrides that must be preserved;
- an upgrade recommendation with evidence and uncertainty.

The assessment never runs target repository scripts and never treats a remote
GitHub file as proof of the local working-copy state.

### Future update workflow

Updating scaffolding requires a separately enabled capability and all of:

1. An explicitly selected repository and per-invocation approval.
2. A clean target tree with no active Git operation.
3. A local TCTBP checkpoint before changes.
4. A pinned, trusted TCTBP-Web source or signed migration bundle.
5. A preview showing added, replaced, preserved, and conflicted files.
6. Managed-file ownership rules that preserve project configuration.
7. Tests and `status --json --no-fetch` after migration.
8. A recoverable rollback path and audit record.

The updater must not execute commands read from the target policy. It applies
known migration operations from the trusted Adviser/TCTBP-Web installation.

## Initial capability state

- Review scaffold health: planned for the read-only MVP.
- Generate an upgrade plan/diff: planned after the first vertical slice.
- Apply updates: disabled until a new threat-model review approves it.
