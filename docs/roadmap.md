# TCTBP-Adviser implementation roadmap

## 1. Bootstrap

- Scaffold from pinned TCTBP-Web contract v1.
- Establish `development → staging → main`.
- Confirm tests, build, human status, and JSON status.
- Record bootstrap, trust, and dogfooding decisions.

## 2. One-repository local inspection

- Configure one repository by opaque identifier.
- Enforce root containment and resolved-path checks.
- Run only service-owned, fixed-argument Git inspection.
- Validate TCTBP profile and contract metadata as untrusted data.
- Keep local working-copy and local tracking-ref evidence separate.

## 3. Deterministic recommendation engine

- Model `action`, `sequence`, `stop`, `inspect`, and `none`.
- Use table-driven compound-state tests.
- Include prerequisites, blocked actions, reason codes, evidence, and freshness.
- Do not use an LLM for workflow decisions.

## 4. Repository detail vertical slice

- Show branch roles, working-tree counts, operations, sync evidence, and age.
- Explain one primary disposition and why alternatives are blocked.
- Add read-only TCTBP scaffold health assessment.
- Allow explicit self-inspection of TCTBP-Adviser.

## 5. Portfolio and GitHub enrichment

- Discover bounded configured roots.
- Add GitHub-visible refs, checks, issues, and releases as separate evidence.
- Support partial failure without collapsing local and provider truth.

## 6. Reference and hardening

- Generate trigger and guardrail reference views from the pinned contract.
- Add intent-oriented workflow sequences.
- Add bounded concurrency, caching, diagnostics, and configuration export.
- Consider preview-only scaffold upgrade plans.

## Deferred product decision

Mutation and scaffold-update execution remain disabled until a separate
security review approves explicit per-run authorisation, repository locks,
trusted migrations, rollback, and audit behaviour.
