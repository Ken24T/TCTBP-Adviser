# ADR 0001: Bootstrap and trust boundaries

## Status

Accepted for the initial local MVP.

## Decision

TCTBP-Adviser is a separate repository from TCTBP-Web.

- TCTBP-Web owns TCTBP policy, runner behaviour, branch-role resolution,
  schemas, capabilities, reason codes, and guardrail identifiers.
- TCTBP-Adviser owns configured repository selection, observation aggregation,
  freshness, deterministic recommendation priority, explanations, and UI.
- The service inspects Git with service-owned executable and argument templates.
- `.github/TCTBP.json` and other target repository content are untrusted data.
- The service does not import or execute JavaScript from a target repository.
- The first production version is read-only and does not fetch implicitly.

## Dogfooding

The Adviser contains a complete scaffolded TCTBP surface and uses it for every
application change after scaffold completion. Direct TCTBP runners remain
sufficient to operate the project if the Adviser service is unavailable.

The first local vertical slice may inspect this repository through an explicit
configuration entry. Automatic self-discovery waits for the portfolio phase.

## Contract pin

The bootstrap source is `Ken24T/TCTBP-Web` commit
`0e99ceaf7436214a40bfcabbc79f57c36c91b035`, TCTBP version `0.2.0`, Adviser
contract major `1`.

Compatibility is capability-based. Unsupported contract major versions stop
advice; unknown additive fields are ignored; missing capabilities disable only
the affected feature.

## Consequences

The Adviser can explain evidence without becoming a hidden execution path.
Workflow execution, GitHub enrichment, portfolio discovery, and target
scaffolding updates remain outside the first vertical slice.
