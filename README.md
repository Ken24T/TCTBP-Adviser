# tctbp-adviser

A local-first, read-only companion for understanding repository state and
choosing safe TCTBP workflows.

The secure single-repository inspection service and deterministic recommendation
engine are implemented. They consume TCTBP-Web Adviser contract v1 pinned to commit
`0e99ceaf7436214a40bfcabbc79f57c36c91b035`.

## Quick Start

1. Install Node.js 18+.
2. Run `npm ci` from the repository root.
3. Copy `.env.example` to `.env`.
4. Set the allowed root and the one repository to inspect using absolute paths.
5. Run `npm run dev`.

The current slice exposes the read-only local API. The repository-detail UI is
the next planned phase.

## TCTBP-Web Runtime

This project was scaffolded with the TCTBP-Web workflow. All TCTBP triggers are available:

```
status please
checkpoint please
publish please
handover please
ship please
promote staging please
deploy dev please
run tests
```

See `.github/TCTBP Cheatsheet.md` for the full operator reference.

TCTBP-Adviser dogfoods this infrastructure. Every application change after the
scaffold commit uses the installed TCTBP workflows, but the Adviser service is
never required to build, test, checkpoint, promote, or ship itself.

## Branch Model

This project uses the staged branch model:

```
development ──promote staging──▶ staging ──promote production──▶ main
     │                                  │                                  │
     ▼                                  ▼                                  ▼
 deploy dev                      deploy staging                    ship → deploy prod
```

## Scripts

- `npm run typecheck` — TypeScript validation
- `npm run test` — Run tests (vitest)
- `npm run test:watch` — Run tests in watch mode
- `npm run build` — Type-check and create the production client bundle


## Project Structure

```
src/              # React client
server/           # Local inspection and recommendation service
shared/           # Contracts shared by client, service, and tests
test/             # Cross-layer fixtures and integration tests
contracts/        # Pinned TCTBP Adviser contract fixtures
schemas/          # Pinned TCTBP JSON Schemas
scripts/          # TCTBP-Web runners (managed)
.github/          # TCTBP workflow configuration
```

## Product Boundaries

- The MVP inspects one explicitly configured local repository.
- Git state is collected with service-owned, fixed-argument `git` commands.
- Target repository scripts and policy command strings are never executed.
- TCTBP installation health may be reviewed in the MVP.
- Scaffolding updates remain disabled until a separately approved migration
  design is implemented.

See [Bootstrap architecture](docs/architecture/0001-bootstrap-boundaries.md),
[scaffold health and upgrades](docs/architecture/0002-scaffold-health-and-upgrades.md),
[secure local inspection](docs/architecture/0003-secure-local-inspection.md),
[deterministic recommendations](docs/architecture/0004-deterministic-recommendations.md),
and the [implementation roadmap](docs/roadmap.md).
