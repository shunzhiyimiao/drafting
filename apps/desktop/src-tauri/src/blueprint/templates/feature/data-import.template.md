---
blueprintId: {{blueprintId}}
type: feature
displayName: {{displayName}}
status: draft
priority: medium
owner: human
tags:
  - import
  - data
---

## Goal

Import {{dataSource}} data into the system.

## Context

External data needs to be loaded periodically. This import handles parsing, validation, and upsert.

## Acceptance Criteria

- [ ] Accept source format (CSV/JSON/XML)
- [ ] Validate each record before insert
- [ ] Report invalid records without aborting the whole batch
- [ ] Upsert based on unique key
- [ ] Rollback on catastrophic failure
- [ ] Generate import summary (total/success/failed)
- [ ] Progress visible during long imports

## Constraints

- Max file size 100MB
- Must be memory-efficient (stream processing)

## Out of Scope

- Real-time sync (this is batch-only)

## Notes

Use streaming parser for large files.
