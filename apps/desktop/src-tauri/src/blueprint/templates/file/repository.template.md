---
blueprintId: {{blueprintId}}
type: file
displayName: {{displayName}}
status: draft
priority: medium
owner: human
targetFile: {{targetFile}}
tags:
  - repository
  - data
---

## Purpose

Data access layer for {{entityName}}.

## Responsibilities

- CRUD operations for {{entityName}}
- Query building
- Transaction management

## Acceptance Criteria

- [ ] All methods use prepared statements
- [ ] Transactions wrap multi-step operations
- [ ] Errors translate DB-specific exceptions
- [ ] Pagination supported for list queries
- [ ] No business logic (belongs in service layer)

## Constraints

- Never expose ORM entities directly
- Use domain types in the public API

## Notes

Consider connection pooling.
