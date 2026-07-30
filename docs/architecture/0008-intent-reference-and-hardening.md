# ADR 0008: Separate intent plans, pinned reference, and safe diagnostics

## Status

Accepted.

## Context

Repository state answers “what is true now”, while an operator intent answers
“what outcome do I want next”. Combining those inputs into one recommendation
made it difficult to distinguish a required safety response from an optional
workflow sequence. Operators also needed a searchable explanation of TCTBP
triggers and guardrails without opening managed scaffold files.

Operational hardening required useful diagnostics and reconstructable settings,
but repository paths, remote names, tokens, target commands, and target code
must remain outside browser responses.

## Decision

- Evaluate the deterministic state recommendation with intent `none`.
- Evaluate a separate intent plan from that same immutable observation.
- Support preservation, publication, handover, resume, pre-production,
  current-environment deployment, production release, and recovery intents.
- Block intent plans when state or contract guardrails require resolution.
- Adapt promotion and deployment steps to simple, staged, and long-lived branch
  strategies. Preserve configured branch names such as `review`; use canonical
  environment trigger names only where TCTBP requires them.
- Prefer the single `handover` workflow for machine transfer.
- Mark each intent step as satisfied, required, or conditional and identify the
  likely next required step.
- Publish a contract-v1 workflow and guardrail catalogue pinned to TCTBP-Web
  revision `0e99ceaf7436214a40bfcabbc79f57c36c91b035`.
- Keep all displayed workflows advisory. The Adviser never runs a target
  repository script or mutation.
- Retain a bounded, in-memory audit of inspections using opaque IDs and safe
  metadata only.
- Export operational configuration as counts and limits while omitting roots,
  GitHub repository names, and tokens.
- Bind the packaged preview command to loopback.

## Consequences

State safety advice remains primary and cannot be overridden by an operator
goal. Intent sequences are explainable and testable without adding execution
authority. Branch-specific workflow maps are useful for both staged and
long-lived repositories without changing the target scaffold.

The reference is intentionally pinned rather than fetched at runtime. Updating
it requires a reviewed Adviser change and matching contract tests.

Diagnostics do not survive process restart and cannot identify a repository by
path. That is deliberate: they support local troubleshooting without expanding
the browser trust boundary.

Preview-only scaffold upgrade plans were considered but are not included.
Scaffold health remains read-only until a separate design approves trusted
migrations, explicit per-run authority, repository locking, rollback, and
mutation audit behaviour.
