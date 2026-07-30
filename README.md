# tctbp-adviser

A local-first, read-only companion for understanding repository state and
choosing safe TCTBP workflows.

The project is currently at the scaffold/bootstrap stage. It consumes TCTBP-Web
Adviser contract v1 pinned to commit
`0e99ceaf7436214a40bfcabbc79f57c36c91b035`.

## Quick Start

1. Install Node.js 18+.
2. Run `npm install` from the repo root.
3. Run `npm run dev` to start the Vite dev server. Run `npm run typecheck` to validate TypeScript. Run `npm run test` to run the test suite.

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
and the [implementation roadmap](docs/roadmap.md).
