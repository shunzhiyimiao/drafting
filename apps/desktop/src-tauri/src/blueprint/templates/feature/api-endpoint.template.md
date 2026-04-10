---
blueprintId: {{blueprintId}}
type: feature
displayName: {{displayName}}
status: draft
priority: medium
owner: human
tags:
  - api
  - http
---

## Goal

Expose {{endpointPath}} as a REST API endpoint.

## Context

This endpoint is consumed by the frontend and external clients. It must conform to the API versioning conventions.

## Acceptance Criteria

- [ ] Request schema validated with clear error messages
- [ ] Response matches documented schema
- [ ] Authentication and authorization enforced
- [ ] Rate limiting applied
- [ ] Errors return proper HTTP status codes
- [ ] Request/response logged for audit
- [ ] OpenAPI spec updated

## Constraints

- Response time under 200ms for p95
- Must use JSON content type
- Follow REST conventions

## Out of Scope

- GraphQL equivalent
- WebSocket variant

## Notes

Check existing middleware before adding new ones.
