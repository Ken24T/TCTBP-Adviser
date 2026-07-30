# tctbp-adviser

A web application built with the TCTBP-Web workflow.

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
src/           # Application source
scripts/       # TCTBP-Web runners (managed, do not edit)
.github/       # TCTBP-Web workflow configuration
templates/     # Scaffold templates (reference only)
```
