# Shared contracts

This directory contains TypeScript types and validation adapters shared by
the client, local service, and tests.

The first adapter targets Adviser inspection contract major version `1` pinned
in `.tctbp/source.json`.

Recommendation types keep outcomes distinct from executable workflows:
`action`, `sequence`, `stop`, `inspect`, and `none`.

The repository-detail response couples one local observation with the
recommendation evaluated from that exact timestamp. Branch-model and
quality-gate observations expose policy facts without exposing repository
command strings.

Portfolio summaries intentionally contain only opaque repository identities,
display names, reduced local observations and recommendation summaries.
Configured roots and canonical paths remain service-only.
