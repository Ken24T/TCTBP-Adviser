# Local service

This directory will contain the localhost-only inspection and recommendation
service.

The service owns Git execution, path containment, freshness, timeouts, output
limits, repository locks, and API trust controls. It must not execute code or
command strings from inspected repositories.
