---
blueprintId: {{blueprintId}}
type: file
displayName: {{displayName}}
status: draft
priority: medium
owner: human
targetFile: {{targetFile}}
tags:
  - validator
---

## Purpose

Input validator for {{inputType}}.

## Responsibilities

- Schema validation
- Business rule checks
- Return structured validation errors

## Acceptance Criteria

- [ ] All required fields checked
- [ ] Type constraints enforced
- [ ] Business rules applied (e.g. uniqueness)
- [ ] Returns all errors at once (not fail-fast)
- [ ] Error messages are user-friendly

## Constraints

- No side effects
- Pure function ideally

## Notes

Reuse the shared validation utilities.
