# Local service

This directory contains the localhost-only inspection service.

The service owns Git execution, path containment, freshness, timeouts, output
limits, repository locks, and API trust controls. It must not execute code or
command strings from inspected repositories.

The first slice exposes:

- `GET /api/health`
- `GET /api/repositories`
- `POST /api/repositories/:id/inspect`

The browser receives an unguessable per-launch token in the same-origin HTML.
No endpoint accepts a repository path or command.
