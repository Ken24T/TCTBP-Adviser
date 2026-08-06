# ADR 0002: TCTBP scaffold health and upgrades

## Status

Accepted as a staged capability: assessment and guarded managed-file apply are
implemented; policy merges and deletions remain deferred.

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

### Guarded managed-file update workflow

The current apply capability requires:

1. An explicitly selected repository and per-invocation confirmation.
2. A plan fingerprint matching a fresh inspection.
3. A clean target tree with no active Git operation.
4. A dedicated non-environment target branch.
5. A pinned, trusted TCTBP-Web source.
6. A preview showing added, replaced, preserved, and blocked files.
7. Managed-file ownership rules that preserve project configuration.
8. Atomic writes only to canonical managed files.
9. No commit, push, deployment, or target-command execution.
10. Tests and `status --json --no-fetch` after the operator reviews the changes.

The updater must not execute commands read from the target policy. It applies
known migration operations from the trusted Adviser/TCTBP-Web installation.
Project-specific policy merges and managed-file deletions require explicit
per-run approval and are never included in additions-only mode.

## Capability state

- Review scaffold health: implemented.
- Generate an upgrade plan/diff: implemented.
- Apply canonical additions or explicitly approved managed-file updates: implemented
  without commit or push.
- Apply project-specific policy merges: available only with explicit managed-path approval.
- Delete obsolete managed files: available only with explicit deletion confirmation.
