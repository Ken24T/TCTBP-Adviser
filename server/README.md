# Local service

This directory contains the localhost-only inspection service.

The service owns Git execution, path containment, freshness, timeouts, output
limits, repository locks, and API trust controls. It must not execute code or
command strings from inspected repositories.

The first slice exposes:

- `GET /api/health`
- `GET /api/repositories`
- `POST /api/repositories/:id/inspect`
- `POST /api/repositories/:id/recommendation`
- `POST /api/repositories/:id/detail`

The browser receives an unguessable per-launch token in the same-origin HTML.
Recommendation and detail endpoints accept only an optional fixed `intent`
enum. The detail response contains one observation and the recommendation
evaluated from that exact observation. No endpoint accepts or returns a
repository path or command.
