---
blueprintId: {{blueprintId}}
type: file
displayName: {{displayName}}
status: draft
priority: low
owner: human
targetFile: {{targetFile}}
tags:
  - utility
---

## Purpose

Utility functions for {{utilityDomain}}.

## Responsibilities

- Stateless helper functions
- Reusable logic used by multiple modules

## Acceptance Criteria

- [ ] All functions are pure (no side effects)
- [ ] Well-documented with examples
- [ ] Has unit tests
- [ ] No external dependencies

## Constraints

- Must be tree-shakeable (one function per export)
- No framework-specific code

## Notes

Check if a similar utility already exists before adding a new one.
