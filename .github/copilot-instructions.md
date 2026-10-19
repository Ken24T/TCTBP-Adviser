# tctbp-adviser – Copilot Instructions

## Shared code and documentation policy

This repository adopts shared-development-policy 1.0.0. Read
`.github/DEVELOPMENT_POLICY.md` and its machine-readable companion
`.github/development-policy.json` for code, configuration and documentation work.
Use `node scripts/check-modularity.cjs --changed` for advisory size signals.
Record design reviews for new or materially changed large files in change notes.
File size alone never requires a split or grants approval to commit or publish.
Existing correctness, security, Git and approval protections remain in force.

## What This Repo Is

This is an **application repository**, not a template repo. You are editing a real project built with the TCTBP-Web workflow. The TCTBP runner surface in `scripts/` and `.github/` manages branch safety, versioning, and deployment — do not modify those files unless explicitly asked. Your job is to build the application code that lives alongside them.

### File Naming

- Use kebab-case for modules: `format-date.ts`, `use-auth.ts`, `api-client.ts`.
- Group related files in directories: `utils/`, `hooks/`, `components/`, `services/`.
- Index files (`index.ts`) should only re-export — no implementation.


## Language & Framework Rules

## Framework: Vite + React + TypeScript

- **Dev server:** `npm run dev` (Vite on port 5173)
- **Build:** `npm run build` (TypeScript → Vite production bundle)
- **Component pattern:** One component per file in `src/`. Use function components with hooks.
- **Styling:** CSS imports. Add Tailwind or CSS modules as needed.
- **Routing:** Add `react-router-dom` when routes are needed.
- **State:** Use React hooks (`useState`, `useReducer`). Add Zustand or Context for shared state.



General rules that apply regardless of framework:

- Prefer `const` over `let`. Never use `var`.
- Use explicit return types on exported functions (TypeScript).
- Review long or deeply nested functions for cohesion; extract useful boundaries.
- No `any` types in exported signatures. Use `unknown` if truly dynamic.
- Prefer pure functions where possible. Side effects should be explicit and documented.
- Handle errors at the boundary. Don't let exceptions propagate through layers silently.
- Write tests alongside code. No untested exported functions in PRs.

## Editing Approach

- **Read before writing.** Understand the file you're editing. Read at least 50 lines of context around the target area.
- **Small edits over rewrites.** Prefer surgical changes. If a change touches more than 3 files, pause and confirm with the user.
- **No speculative changes.** Don't "fix" things not mentioned in the request. Don't refactor unless asked.
- **Explain trade-offs.** When there are multiple approaches, briefly state which you chose and why.
- **Preserve existing patterns.** Match the codebase's conventions — don't impose your own style.

## TCTBP Workflow Awareness

This repo uses TCTBP-Web for branch safety, versioning, and deployment. Key files you should know about but not casually edit:

- `.github/TCTBP.json` — machine-readable workflow policy and project profile
- `.github/TCTBP Agent.md` — behavioural rules and guard rails
- `scripts/tctbp-run-*.js` — deterministic workflow runners (status, checkpoint, ship, promote, deploy, etc.)
- `scripts/tctbp-core.js` — shared runner library

When you see TCTBP triggers (checkpoint, ship, promote, etc.), those are handled by the TCTBP agent, not by you. Don't try to implement workflow steps manually.

## Handover & Continuation Prompts

When the user says `handover` or `handover please`, compose a continuation file at `.tctbp/continuation/YYYY-MM-DD-HHmm.md` (UTC, 24-hour time) before the handover script runs. This timestamped filename prevents same-day overwrites. Use this structure:

```markdown
# Handover Continuation — YYYY-MM-DD

## Session Summary
What was accomplished this session. Key decisions made and why. Unfinished work intentionally deferred.

## Plan Progress
Which chunks/tasks completed, which is next, and the relevant plan file.

## Files Touched
Key files modified or created with a short note on what changed in each.

## Tickets
Tickets worked on and any still-open for the next session.

## Checkpoint Log
Commit hashes created in order with one-line messages.

## Mistakes & Gotchas
Things that went wrong and how they were fixed. Include WHY, not just WHAT.

## Branch & Commit Context
- Machine, branch, last commit, working tree state, upstream sync, remote URL.

## Next Session
The recommended first action for the next session. Be specific.
```

For `handover local`, skip the publish step — the file is committed locally only. Say `orient` or `pick up from handover` in the next session to pick up the newest continuation file.

## Branch Model

This project uses the **staged branch model**: `development` → `staging` → `main`.

- `development` — Active development. Checkpoint and publish freely.
- `staging` — Field-testing and review. Promote from `development` before deploying staging.
- `main` — Production. Promote from `staging`, then ship and deploy.

Never commit directly to `staging` or `main`. Always promote through the chain.

## Project-Specific Conventions

These are configured in `.github/TCTBP.json` under `developmentPolicy`. Read them before generating code:

- **Test framework:** vitest
- **Linting/formatting rules:** Configured in `package.json` scripts
- **Module style:** ES modules (TypeScript)
- **Code style:** Prettier + ESLint (configure when you add them)

Update `.github/TCTBP.json` → `developmentPolicy` as the project's conventions evolve.
