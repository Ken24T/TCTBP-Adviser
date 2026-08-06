# ADR 0003: Secure local repository inspection

## Status

Accepted and implemented for the single-repository MVP.

## Decision

The service receives one repository path and one allowed root through
server-side environment configuration. Both paths must be absolute and their
resolved locations must satisfy root containment. The repository is exposed to
the browser only through an opaque, per-launch identifier.

The service observes Git with fixed command templates:

- porcelain-v2 status with local branch/upstream headers;
- resolved repository top-level;
- resolved Git directory;
- resolved canonical source HEAD.

Approved TCTBP infrastructure updates use bounded, atomic file writes only for
canonical managed paths. They do not execute target commands or perform Git
commit, push, deploy, or workflow operations.

Commands use `execFile`, `shell: false`, bounded runtime and output, disabled
optional locks, disabled hooks and filesystem monitors, and no system/global
Git configuration. No inspection command fetches.

TCTBP profile and scaffold-source files are bounded, non-symlink JSON inputs.
They are parsed as untrusted data. Commands, scripts, hooks, filters and package
tasks named by the target repository are never executed.

## Browser boundary

Vite serves the UI and API from one loopback origin. The service:

- accepts only `localhost`, `127.0.0.1` or `::1` Host values;
- rejects a mismatched Origin;
- issues an unguessable per-launch `HttpOnly`, `SameSite=Strict` session cookie;
- accepts no repository path or command in an API request;
- returns no filesystem path to the browser.

## API

- `GET /api/health`
- `GET /api/repositories`
- `POST /api/repositories/:id/inspect`
- `POST /api/repositories/:id/tctbp-upgrade-plan`
- `POST /api/repositories/:id/tctbp-apply`

The inspection response separates local working-copy evidence from local
tracking-reference evidence, records its basis and timestamp, and states that
no fetch occurred.

## Deferred

Recommendations, workflow execution, project-specific policy merges, obsolete
managed-file deletion, and deployment remain outside this slice. Canonical
managed-file creation and explicitly approved updates are bounded exceptions.
