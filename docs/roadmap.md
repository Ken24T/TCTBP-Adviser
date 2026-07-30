# TCTBP-Adviser implementation roadmap

## 1. Bootstrap — complete

- Scaffold from pinned TCTBP-Web contract v1.
- Establish `development → staging → main`.
- Confirm tests, build, human status, and JSON status.
- Record bootstrap, trust, and dogfooding decisions.

## 2. One-repository local inspection — complete

- Configure one repository by opaque identifier.
- Enforce root containment and resolved-path checks.
- Run only service-owned, fixed-argument Git inspection.
- Validate TCTBP profile and contract metadata as untrusted data.
- Keep local working-copy and local tracking-ref evidence separate.

## 3. Deterministic recommendation engine — complete

- Model `action`, `sequence`, `stop`, `inspect`, and `none`.
- Use table-driven compound-state tests.
- Include prerequisites, blocked actions, reason codes, evidence, and freshness.
- Do not use an LLM for workflow decisions.

## 4. Repository detail vertical slice — complete

- Show branch roles, working-tree counts, operations, sync evidence, and age.
- Explain one primary disposition and why alternatives are blocked.
- Add read-only TCTBP scaffold health assessment.
- Allow explicit self-inspection of TCTBP-Adviser.

## 5. Portfolio discovery — complete

- Discover bounded configured roots.
- Reconcile canonical local paths and skip excluded or symbolic-link trees.
- Cache discovery and inspection with explicit manual refresh.
- Present non-TCTBP, unavailable and stale states without collapsing the view.
- Support browser-only pin, hide and rename preferences.

## 6. GitHub enrichment — complete

- Map supported local GitHub origins without exposing remote URLs or tokens.
- Show GitHub-visible branches and commits, checks, workflows, issues, pull
  requests, tags and releases as timestamped provider evidence.
- Support explicitly configured GitHub-only repositories.
- Preserve local advice through missing credentials, partial provider failure,
  rate limits and local-only repositories.

## 7. Reference and hardening

- Generate trigger and guardrail reference views from the pinned contract.
- Add intent-oriented workflow sequences.
- Add bounded concurrency, caching, diagnostics, and configuration export.
- Consider preview-only scaffold upgrade plans.

## Deferred product decision

Mutation and scaffold-update execution remain disabled until a separate
security review approves explicit per-run authorisation, repository locks,
trusted migrations, rollback, and audit behaviour.
