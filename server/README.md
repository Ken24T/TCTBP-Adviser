# Local service

This directory contains the localhost-only discovery and inspection service.

The service owns Git execution, path containment, freshness, timeouts, output
limits, repository locks, and API trust controls. It must not execute code or
command strings from inspected repositories.

The current local-first portfolio exposes:

- `GET /api/health`
- `GET /api/repositories`
- `GET /api/portfolio`
- `POST /api/repositories/refresh`
- `POST /api/repositories/:id/inspect`
- `POST /api/repositories/:id/recommendation`
- `POST /api/repositories/:id/detail`

The browser receives an unguessable per-launch token in the same-origin HTML.
Recommendation and detail endpoints accept only an optional fixed `intent`
enum. The detail response contains one observation and the recommendation
evaluated from that exact observation. No endpoint accepts or returns a
repository path or command.

Discovery scans only canonical configured roots, stops at explicit depth,
directory and repository limits, skips configured directory names, and does
not follow directory symbolic links. Portfolio inspection uses bounded
concurrency and isolates individual repository failures.

Optional GitHub enrichment maps supported `origin` URLs to `owner/name` inside
the service and performs only fixed, bounded, read-only REST requests. Provider
observations include retrieval timestamps. Provider sections fail
independently, and a complete provider failure does not remove local evidence
or alter its deterministic recommendation. An optional GitHub token remains in
server configuration and is never returned through an API.
