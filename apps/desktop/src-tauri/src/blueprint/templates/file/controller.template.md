---
blueprintId: {{blueprintId}}
type: file
displayName: {{displayName}}
status: draft
priority: medium
owner: human
targetFile: {{targetFile}}
tags:
  - controller
  - http
---

## Purpose

HTTP controller handling {{routePrefix}} routes.

## Responsibilities

- Route matching
- Request validation and parsing
- Delegate to service layer
- Format response

## Acceptance Criteria

- [ ] Each route handler is small and focused
- [ ] Input validated before hitting service layer
- [ ] Errors mapped to HTTP status codes
- [ ] Response shape matches API contract
- [ ] No business logic in handlers

## Constraints

- Thin controllers — delegate work to services
- Never expose internal error details

## Notes

Keep handler functions under 20 lines.
