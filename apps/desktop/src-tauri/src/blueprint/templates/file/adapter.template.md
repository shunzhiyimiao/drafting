---
blueprintId: {{blueprintId}}
type: file
displayName: {{displayName}}
status: draft
priority: medium
owner: human
targetFile: {{targetFile}}
relatedSockets: []
tags:
  - adapter
  - patchboard
---

## Purpose

Patchboard adapter implementing {{socketName}}.

## Responsibilities

- Implement all methods of the socket
- Translate between external system and the socket contract
- Handle errors from the external system

## Acceptance Criteria

- [ ] Implements the full socket interface
- [ ] Constructor takes all dependencies explicitly
- [ ] No `extends` — leaf class
- [ ] External errors mapped to domain errors
- [ ] Has unit tests

## Constraints

- Must not leak implementation details through the socket
- No static state

## Notes

Keep method bodies thin — translate and delegate.
