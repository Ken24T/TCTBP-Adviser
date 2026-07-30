# tctbp-adviser

A local-first, read-only companion for understanding repository state and
choosing safe TCTBP workflows.

The secure local portfolio service, deterministic recommendation engine,
portfolio dashboard, and repository-detail UI are implemented. They consume
TCTBP-Web Adviser contract v1 pinned to commit
`0e99ceaf7436214a40bfcabbc79f57c36c91b035`.

## Quick Start

1. Install Node.js 18+.
2. Run `npm ci` from the repository root.
3. Copy `.env.example` to `.env`.
4. Configure one or more absolute repository roots as a JSON array.
5. Run `npm run dev`.

The application discovers bounded local roots and opens the portfolio
dashboard. Select a repository to see local branch and working-tree state, one
primary recommendation, blocked alternatives, effects and non-effects,
quality-gate configuration, TCTBP compatibility, and read-only scaffold health.

TCTBP-Adviser appears automatically when its checkout is within a configured
root. The same rules and guardrails apply to self-inspection.

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

- The local portfolio inspects repositories discovered beneath explicitly
  configured roots.
- Discovery is limited by configured roots, depth, directory and repository
  caps; directory symbolic links are not followed.
- Duplicate canonical local paths are reconciled before inspection.
- The UI never receives the configured repository path or repository command
  strings.
- Git state is collected with service-owned, fixed-argument `git` commands.
- Target repository scripts and policy command strings are never executed.
- TCTBP installation health may be reviewed in the MVP.
- Scaffolding updates remain disabled until a separately approved migration
  design is implemented.
- Pin, hide and rename preferences are browser-only Adviser settings. They do
  not modify repositories.

See [Bootstrap architecture](docs/architecture/0001-bootstrap-boundaries.md),
[scaffold health and upgrades](docs/architecture/0002-scaffold-health-and-upgrades.md),
[secure local inspection](docs/architecture/0003-secure-local-inspection.md),
[deterministic recommendations](docs/architecture/0004-deterministic-recommendations.md),
[repository detail](docs/architecture/0005-repository-detail.md),
[portfolio discovery](docs/architecture/0006-portfolio-discovery.md),
and the [implementation roadmap](docs/roadmap.md).
