# tctbp-adviser

A local-first, read-only companion for understanding repository state and
choosing safe TCTBP workflows.

The secure local portfolio service, deterministic recommendation and intent
engines, pinned trigger/guardrail reference, optional GitHub enrichment,
portfolio dashboard, and repository-detail UI are implemented. They consume
TCTBP-Web Adviser contract v1 pinned to commit
`0e99ceaf7436214a40bfcabbc79f57c36c91b035`.

## Quick Start

1. Install Node.js 18+.
2. Run `npm ci` from the repository root.
3. Copy `.env.example` to `.env`.
4. Configure one or more absolute repository roots as a JSON array.
5. Run `npm run dev` for development, `npm run review` for the review
   environment, or `npm run production` for the loopback-only production
   preview.

The local environment ports are development `3037`, review `4037`, and
production preview `5037`.

To enable read-only canonical TCTBP upgrade plans, set
`TCTBP_ADVISER_TCTBP_WEB_ROOT` to a local TCTBP-Web checkout beneath one of the
configured repository roots. The Adviser reads its managed-file inventory and
source revision but does not modify or execute the canonical checkout.

The application discovers bounded local roots and opens the portfolio
dashboard. Select a repository to see local branch and working-tree state, one
primary recommendation, blocked alternatives, effects and non-effects,
quality-gate configuration, TCTBP compatibility, and read-only scaffold health.
An outcome selector adds a separate conditional intent plan for preservation,
machine transfer, promotion, deployment, release, and interrupted-workflow
recovery. The TCTBP reference view explains pinned triggers, aliases, runners,
effects, non-effects, and guardrails.
When GitHub enrichment is enabled, the same views add separately timestamped
GitHub branches, commits, checks, workflows, pull requests, issues, tags and
releases.

TCTBP-Adviser appears automatically when its checkout is within a configured
root. The same rules and guardrails apply to self-inspection.

## Optional GitHub Enrichment

Set `TCTBP_ADVISER_GITHUB_ENABLED=true` to enrich supported local GitHub
origins. Public repositories do not require a token. Private repositories can
use `TCTBP_ADVISER_GITHUB_TOKEN`, which is read only by the local service and is
never sent to the browser.

Add bounded GitHub-only repositories as an explicit JSON array:

```text
TCTBP_ADVISER_GITHUB_REPOSITORIES=["Ken24T/TCTBP-Adviser"]
```

GitHub failure is labelled as partial provider evidence; local inspection and
advice remain usable. Refreshing the portfolio refreshes both discovery and
provider observations, but never performs `git fetch`.

## TCTBP-Web Runtime

This project was scaffolded with the TCTBP-Web workflow. All TCTBP triggers are available:

```
status please
checkpoint please
publish please
handover please
ship please
promote review please
deploy dev please
run tests
```

See `.github/TCTBP Cheatsheet.md` for the full operator reference.

TCTBP-Adviser dogfoods this infrastructure. Every application change after the
scaffold commit uses the installed TCTBP workflows, but the Adviser service is
never required to build, test, checkpoint, promote, or ship itself.

## Branch Model

This project uses the long-lived environment branch model:

```
development ──promote review──▶ review ──promote production──▶ main
     │                              │                              │
     ▼                              ▼                              ▼
 deploy dev                    deploy review                 ship → deploy prod
```

The TCTBP contract also retains `staging` as a compatibility name for the
pre-production deployment trigger where required by the pinned workflow
reference.

## Scripts

- `npm run dev` — Development Vite server on port 3037
- `npm run review` — Review Vite server on port 4037
- `npm run typecheck` — TypeScript validation
- `npm run test` — Run tests (vitest)
- `npm run test:watch` — Run tests in watch mode
- `npm run build` — Type-check and create the production client bundle
- `npm run production` — Build and serve the production preview on port 5037
- `npm start` — Serve the existing production build on port 5037


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
- GitHub REST requests are read-only, fixed-host, bounded and service-side.
- GitHub evidence has its own retrieval timestamp and never overrides local
  working-copy evidence or deterministic advice.
- TCTBP installation health may be reviewed in the MVP.
- Scaffolding updates remain disabled until a separately approved migration
  design is implemented.
- Pin, hide and rename preferences are browser-only Adviser settings. They do
  not modify repositories.
- Intent plans are clearly separate from state-driven recommendations and
  never execute their displayed triggers.
- The bounded in-memory inspection audit contains opaque repository IDs,
  timestamps, durations and safe error codes only.
- Configuration export omits repository paths, GitHub repository names and
  tokens.

See [Bootstrap architecture](docs/architecture/0001-bootstrap-boundaries.md),
[scaffold health and upgrades](docs/architecture/0002-scaffold-health-and-upgrades.md),
[secure local inspection](docs/architecture/0003-secure-local-inspection.md),
[deterministic recommendations](docs/architecture/0004-deterministic-recommendations.md),
[repository detail](docs/architecture/0005-repository-detail.md),
[portfolio discovery](docs/architecture/0006-portfolio-discovery.md),
[GitHub enrichment](docs/architecture/0007-github-enrichment.md),
[intent reference and hardening](docs/architecture/0008-intent-reference-and-hardening.md),
and the [implementation roadmap](docs/roadmap.md).
