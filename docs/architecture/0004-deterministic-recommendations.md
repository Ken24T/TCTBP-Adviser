# ADR 0004: Deterministic recommendation engine

## Status

Accepted and implemented for the single-repository MVP.

## Decision

TCTBP-Adviser owns recommendation priority and intent overlay. The engine is a
pure TypeScript rules function over a validated local observation. It does not
use an LLM, execute a workflow, fetch state or import target-repository code.

Each result contains:

- one disposition: `action`, `sequence`, `stop`, `inspect` or `none`;
- a nullable primary action and ordered steps;
- stable reason codes and blocked actions;
- evidence with observation basis and timestamp;
- uncertainties, policy source and observation identity;
- freshness and explicit effects/non-effects.

## Safety priority

Rules are evaluated in this order:

1. stale or invalid observation;
2. missing or incompatible TCTBP;
3. active operation or index conflict;
4. unborn or detached HEAD;
5. divergence;
6. dirty plus behind;
7. unavailable local tracking evidence;
8. clean behind;
9. safe intent overlay;
10. dirty, ahead, unpublished or healthy state.

This ordering guarantees that divergence is never represented as resumable and
dirty-plus-behind never exposes `resume` as an immediate action.

## Intent

The API accepts only a fixed intent enum. Machine-transfer intent may select
`handover` only after all higher-priority safety rules pass and only when the
target advertises that workflow.

## API

`POST /api/repositories/:id/recommendation` accepts either an empty body or:

```json
{
  "intent": "continue-on-another-machine"
}
```

Additional fields, arbitrary commands, paths and unsupported intent values are
rejected.

## Deferred

The broader intent catalogue, portfolio discovery, GitHub enrichment and all
workflow execution remain outside this phase. The repository-detail UI was
added in the following vertical slice.
