---
blueprintId: {{blueprintId}}
type: feature
displayName: {{displayName}}
status: draft
priority: medium
owner: human
tags:
  - crud
  - service
---

## Goal

Provide create/read/update/delete operations for {{entityName}}.

## Context

This service manages the lifecycle of {{entityName}} entities in the system. Other modules depend on it for CRUD operations.

## Acceptance Criteria

- [ ] Create {{entityName}} with required fields validated
- [ ] Read single {{entityName}} by ID
- [ ] List {{entityName}} with pagination and filters
- [ ] Update {{entityName}} (partial and full)
- [ ] Delete {{entityName}} (soft delete if applicable)
- [ ] All operations emit audit events
- [ ] Errors return structured error responses

## Constraints

- Must use the repository pattern
- All mutations require authentication
- Validation errors use the standard error shape

## Out of Scope

- Bulk operations
- Export/import

## Notes

Consider caching read operations.
