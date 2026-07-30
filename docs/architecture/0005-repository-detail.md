# ADR 0005: Atomic repository-detail view

## Status

Accepted and implemented for the single-repository local MVP.

## Decision

The browser presents one configured repository as a read-only operational
brief. The view shows:

- repository identity and TCTBP description;
- current branch, working-tree counts, active operations and local tracking;
- one deterministic recommendation and its freshness;
- workflow steps, effects, non-effects and blocked alternatives;
- branch roles, configured quality gates and TCTBP compatibility;
- managed-scaffold presence and known evidence limits.

The local service exposes:

```text
POST /api/repositories/:id/detail
```

It performs one inspection and evaluates the recommendation from that exact
observation. This avoids presenting Git and recommendation panels derived from
different points in time.

## Trust boundary

The endpoint uses the same loopback, same-origin and per-launch session controls
as the inspection API. It accepts only the fixed recommendation intent enum.
It never accepts or returns repository paths, arbitrary commands, dirty
filenames or environment data.

TCTBP profile command values remain untrusted and are never returned. Quality
gates are reduced to identifiers plus configured/required booleans. Branch
configuration is reduced to branch roles and names.

## Freshness

Remote comparisons are explicitly labelled as local tracking-ref evidence.
The view states that no fetch occurred and does not present cached refs as
current GitHub truth.

## Self-inspection

TCTBP-Adviser can be selected as the configured repository. It receives no
special permissions and is evaluated by the same deterministic rules as every
other repository.

## Deferred

Portfolio discovery, GitHub observations, richer intent paths, generated
trigger/guardrail reference pages and every mutation or scaffold-update action
remain outside this slice.
